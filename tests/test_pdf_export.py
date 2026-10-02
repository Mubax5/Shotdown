from pathlib import Path
from PIL import Image, ImageDraw
from longchatpdf.models import ExportConfig
from longchatpdf.pdf_export import export_pdfs

def test_export_respects_hard_cap(tmp_path: Path):
    pages=[]
    for i in range(12):
        img=Image.new("RGB",(900,1250),(22,24,27))
        draw=ImageDraw.Draw(img)
        for y in range(40,1200,55):
            x=60+((i*17+y)%180)
            draw.rectangle((x,y,820,y+22),fill=(55+i*3,82,74))
            draw.rectangle((80,y+27,600,y+35),fill=(150,155,158))
        p=tmp_path/f"p{i:03d}.png"
        img.save(p)
        pages.append(p)
    cfg=ExportConfig(
        output_dir=str(tmp_path/"out"),
        output_prefix="evidence",
        part_preference="auto",
        max_mb_per_file=.75,
        min_scale=.48,
        min_quality=38,
        max_quality=88,
    )
    result=export_pdfs(pages,tmp_path/"work",cfg)
    assert 1 <= len(result.pdf_paths) <= 3
    for p in result.pdf_paths:
        assert p.stat().st_size <= int(cfg.max_mb_per_file*1_000_000)
