from PIL import Image, ImageDraw
for s in (180,192,512):
    i=Image.new('RGB',(s,s),'#14532d'); d=ImageDraw.Draw(i); u=s/100
    d.pieslice([30*u,18*u,70*u,62*u],0,180,fill='#facc15'); d.rectangle([30*u,18*u,70*u,40*u],fill='#facc15')
    d.rectangle([46*u,58*u,54*u,74*u],fill='#facc15'); d.rounded_rectangle([33*u,72*u,67*u,82*u],radius=2*u,fill='#facc15')
    d.arc([18*u,22*u,40*u,46*u],90,270,fill='#facc15',width=int(4*u)); d.arc([60*u,22*u,82*u,46*u],270,90,fill='#facc15',width=int(4*u))
    i.save(f'app/icon-{s}.png')
