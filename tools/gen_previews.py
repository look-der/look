#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 CAD 图纸（DXF）渲染为白底预览 PNG。
用法：
    python tools/gen_previews.py <dxf目录> <输出目录>

特性：
  - 使用 ezdxf 的 matplotlib 后端绘制模型空间；
  - 计算视图范围时排除“尺寸标注层(A-DIM)”中的误放离群尺寸线（这些实体常被放在
    极远坐标，会把整图视图撑到极小），其余图层仍正常绘制；
  - 绘制后强制中文字体（SimHei / SimSun），标题栏中文图名与标注正常显示；
  - 白色背景、等比例、内容自适应铺满，适合做作品封面 / 缩略图；
  - 单文件出错不中断其它文件。
"""
import os
import sys
import glob
import traceback

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

import ezdxf
from ezdxf import bbox
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.addons.drawing import config as draw_config

# ---------- 注册中文字体 ----------
for fp in (r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\simsun.ttc"):
    if os.path.exists(fp):
        try:
            font_manager.fontManager.addfont(fp)
        except Exception:
            pass
plt.rcParams["font.sans-serif"] = ["SimHei", "SimSun", "Microsoft YaHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

import re as _re
import dataclasses as _dc


def _dc_replace(obj, **kwargs):
    return _dc.replace(obj, **kwargs)


def _strip_dxf_codes(s):
    """去掉 DXF 文字里的控制码（%%u 下划线 / %%c 直径 / %%d 度 等）。"""
    if not s:
        return s
    s = _re.sub(r"%%[uUoO]", "", s)        # 开关下划线
    s = _re.sub(r"%%[cC]", "Φ", s)          # 直径符号
    s = _re.sub(r"%%[dD]", "°", s)          # 度
    s = s.replace("%%p", "±").replace("%%%", "%")
    return s


def draw_texts_manual(ax, msp, xmin, xmax):
    """ezdxf 自带文字引擎无中文字形，改为用 matplotlib + SimHei 按坐标手绘 TEXT。"""
    xrange = max(xmax - xmin, 1.0)
    pts_per_unit = 864.0 / xrange  # 画布宽固定 12in = 864pt，等比例下每数据单位对应点数
    for e in msp:
        if e.dxftype() != "TEXT":
            continue
        try:
            s = _strip_dxf_codes(e.dxf.text)
            if not s or not s.strip():
                continue
            x = float(e.dxf.insert.x)
            y = float(e.dxf.insert.y)
            h = float(e.dxf.height or 300.0)
            rot = float(e.dxf.rotation or 0.0)
            fs = h * pts_per_unit
            fs = max(2.0, min(140.0, fs))  # 限制字号上下限，避免 freetype 报错
            ax.text(
                x, y, s,
                fontfamily=["SimHei", "SimSun"],
                fontsize=fs, rotation=rot,
                color="#1b1f24", ha="left", va="bottom",
            )
        except Exception:
            pass


def compute_view_bounds_from_coords(xs, ys, outlier=300000.0):
    """从已绘制坐标中剔除极远离群点（误放尺寸线等），再用 1%/99% 百分位对主体内容做紧凑裁切。"""
    if xs is None or len(xs) < 50:
        return None
    mask = (np.abs(xs) < outlier) & (np.abs(ys) < outlier)
    xin = xs[mask]; yin = ys[mask]
    if len(xin) < 50:
        return None
    # p1/p99 会自然剔除 -195000 这类单点离群（建筑本体在 0~13万量级）
    xmin, xmax = np.percentile(xin, 1), np.percentile(xin, 99)
    ymin, ymax = np.percentile(yin, 1), np.percentile(yin, 99)
    if not (xmax > xmin and ymax > ymin):
        return None
    return (float(xmin), float(xmax), float(ymin), float(ymax))


def crop_to_content(png_path, margin=0.03):
    """按非白像素包围盒裁切 PNG，去除图纸四周空白，让主体铺满；裁切失败则保留原图。"""
    try:
        from PIL import Image
        im = Image.open(png_path).convert("L")
        arr = np.asarray(im)
        dark = arr < 200
        ys, xs = np.where(dark)
        if len(xs) < 50:
            return
        x0, x1 = xs.min(), xs.max()
        y0, y1 = ys.min(), ys.max()
        h, w = arr.shape
        mx = max(1, int((x1 - x0) * margin))
        my = max(1, int((y1 - y0) * margin))
        x0 = max(0, x0 - mx); x1 = min(w - 1, x1 + mx)
        y0 = max(0, y0 - my); y1 = min(h - 1, y1 + my)
        if x1 - x0 < 10 or y1 - y0 < 10:
            return
        rgb = Image.open(png_path).convert("RGB")
        rgb.crop((x0, y0, x1 + 1, y1 + 1)).save(png_path, "PNG")
    except Exception:
        pass


def compute_view_bounds_solid(msp):
    """仅按实体图层（墙/板/门/填充/家具等）计算视图范围，排除横跨全图幅的
    轴网层(A-AXIS)与尺寸层(A-DIM)离群线，避免真实内容被网格留白撑小。"""
    try:
        ents = [e for e in msp
                if e.dxf.layer not in ("A-DIM", "A-AXIS")]
        b = bbox.extents(ents)
        if b is None:
            return None
        xmin, xmax = float(b.extmin.x), float(b.extmax.x)
        ymin, ymax = float(b.extmin.y), float(b.extmax.y)
        if xmax > xmin and ymax > ymin:
            return (xmin, xmax, ymin, ymax)
    except Exception:
        pass
    return None


def collect_drawn_coords(ax):
    xs, ys = [], []
    for col in ax.collections:
        try:
            offs = col.get_offsets()
            if offs is not None and len(offs):
                xs.append(offs[:, 0]); ys.append(offs[:, 1])
        except Exception:
            pass
        for p in col.get_paths():
            v = p.vertices
            if v is not None and len(v):
                xs.append(v[:, 0]); ys.append(v[:, 1])
    for ln in ax.lines:
        v = ln.get_xydata()
        if v is not None and len(v):
            xs.append(v[:, 0]); ys.append(v[:, 1])
    if not xs:
        return None, None
    return np.concatenate(xs), np.concatenate(ys)


def render_dxf(src, dst, dpi=150):
    doc = ezdxf.readfile(src)
    msp = doc.modelspace()

    # 视图范围优先用实体图层范围（排除轴网 / 尺寸层离群线），失败再回退到已绘制坐标
    solid_view = compute_view_bounds_solid(msp)

    fig = plt.figure(figsize=(12, 8), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()

    ctx = RenderContext(doc)
    ctx.set_current_layout(msp)
    out = MatplotlibBackend(ax)
    # ezdxf 自带文字引擎无中文字形，先忽略其文字渲染，改由 draw_texts_manual 手绘中文
    draw_cfg = _dc_replace(draw_config.Configuration(), text_policy=draw_config.TextPolicy.IGNORE)
    Frontend(ctx, out, config=draw_cfg).draw_layout(msp, finalize=True)

    # ezdxf 不渲染 CAD 线宽，大坐标范围下线条会被画成极细导致发虚。
    # 这里给所有线条设置最小可见线宽，让轮廓 / 门窗清晰。
    for ln in ax.lines:
        try:
            ln.set_linewidth(max(float(ln.get_linewidth()), 1.3))
        except Exception:
            pass
    for col in ax.collections:
        try:
            col.set_linewidth(max(float(col.get_linewidth() or 0.0), 1.0))
        except Exception:
            pass

    # 确定视图范围：优先实体图层范围，回退到已绘制坐标紧凑裁切
    if solid_view is not None:
        xmin, xmax, ymin, ymax = solid_view
    else:
        xs, ys = collect_drawn_coords(ax)
        view = compute_view_bounds_from_coords(xs, ys)
        if view is None:
            xmin, xmax, ymin, ymax = ax.get_xlim()[0], ax.get_xlim()[1], ax.get_ylim()[0], ax.get_ylim()[1]
        else:
            xmin, xmax, ymin, ymax = view

    # 留 2% 余量
    xpad = (xmax - xmin) * 0.02 or 1.0
    ypad = (ymax - ymin) * 0.02 or 1.0
    xmin -= xpad; xmax += xpad; ymin -= ypad; ymax += ypad

    # 用 matplotlib + SimHei 按 DXF 坐标手绘中文 TEXT（标题栏 / 轴号 / 图名等）
    draw_texts_manual(ax, msp, xmin, xmax)

    # 画布比例贴合内容，避免大留白 / 变形
    w = max(xmax - xmin, 1.0)
    h = max(ymax - ymin, 1.0)
    aspect = h / w
    fw = 12.0
    fh = max(4.0, min(20.0, fw * aspect))
    fig.set_size_inches(fw, fh)

    ax.set_aspect("equal")
    ax.set_xlim(xmin, xmax)
    ax.set_ylim(ymin, ymax)

    # 注意：不能用 bbox_inches="tight"，否则会按所有图元（含远处离群点）重算包围盒
    fig.savefig(dst, dpi=dpi, facecolor="white", edgecolor="none")
    plt.close(fig)

    # 后处理：按实际非白像素包围盒裁切，去除图幅空白边，让图纸主体铺满画布
    crop_to_content(dst, margin=0.03)


def main():
    if len(sys.argv) < 3:
        print("用法: python tools/gen_previews.py <dxf目录> <输出目录>")
        sys.exit(1)

    src_dir = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)

    files = sorted(glob.glob(os.path.join(src_dir, "*.dxf")))
    if not files:
        print("未找到 DXF 文件:", src_dir)
        sys.exit(1)

    print(f"共发现 {len(files)} 个 DXF，开始渲染…")
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        dst = os.path.join(out_dir, name + ".png")
        try:
            render_dxf(f, dst)
            print(f"  OK {name}.png")
        except Exception as e:
            print(f"  FAIL {name}: {e}")
            traceback.print_exc()

    print("完成，输出目录:", out_dir)


if __name__ == "__main__":
    main()
