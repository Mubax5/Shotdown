from PIL import Image, ImageDraw
from longchatpdf.browser import _crop_new_content

def test_visual_overlap_crop():
    base=Image.new("RGB",(420,1000),(19,28,34))
    d=ImageDraw.Draw(base)
    for y in range(20,980,35):
        d.rectangle((30+(y%70),y,350,y+12),fill=(80+(y%90),140,130))
    prev=base.crop((0,0,420,600))
    current=base.crop((0,400,420,1000))
    new=_crop_new_content(prev,current,fallback_new_px=400)
    assert 360 <= new.height <= 440
