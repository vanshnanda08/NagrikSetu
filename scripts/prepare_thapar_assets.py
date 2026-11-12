#!/usr/bin/env python3
"""Create clearly labelled deterministic schematics and upload them once.

No real incidents or camera captures are represented. Credentials/preset are read
from a private JSON file, never arguments, output or the public asset manifest.
"""
import argparse, concurrent.futures, hashlib, io, json, math, random, time
from pathlib import Path
import urllib.request, urllib.error
from PIL import Image, ImageDraw, ImageFont


def schematic(key,category,repair):
    rng=random.Random(int(hashlib.sha256(('thapar-demo-v2:'+key).encode()).hexdigest(),16))
    image=Image.new('RGB',(960,640),'#F4F6F8');draw=ImageDraw.Draw(image)
    draw.rectangle((0,0,960,124),fill='#174C5B')
    def label(text,x,y,scale=3,fill='#172B3A'):
        font=ImageFont.load_default();box=font.getbbox(text);layer=Image.new('RGBA',(box[2]+3,box[3]+4),(0,0,0,0));ImageDraw.Draw(layer).text((1,0),text,font=font,fill=fill);layer=layer.resize((layer.width*scale,layer.height*scale),Image.Resampling.NEAREST);image.paste(layer,(x,y),layer)
    label('SYNTHETIC DEMONSTRATION ONLY',24,15,4,'white')
    label('THAPAR DEMO V2 - NOT A REAL INCIDENT',24,73,3,'white')
    # Irregular diagram geometry also gives each asset distinct verified content.
    for _ in range(18):
        x=rng.randrange(-80,900);y=rng.randrange(145,490);size=rng.randrange(45,180);shade=rng.randrange(40,228)
        draw.ellipse((x,y,x+size,y+size//2+25),fill=(shade,shade,min(255,shade+8)))
    road=[(x,320+rng.randrange(-65,65)) for x in range(-50,1050,100)]
    draw.line(road,fill='#5B6978',width=100)
    for x,y in road:draw.line((x-22,y,x+22,y),fill='white',width=4)
    x,y=rng.randrange(230,700),rng.randrange(260,390)
    if repair:draw.rounded_rectangle((x-70,y-30,x+70,y+35),radius=8,fill='#174C5B',outline='white',width=4)
    elif category in ('POTHOLE','OPEN_MANHOLE','DRAINAGE_BLOCK'):draw.ellipse((x-48,y-24,x+48,y+24),fill='#172B3A',outline='white',width=3)
    elif category in ('GARBAGE_DUMP','ILLEGAL_DUMPING'):draw.polygon([(x-65,y+28),(x-30,y-50),(x+60,y+28)],fill='#172B3A',outline='white')
    elif category in ('STREETLIGHT','SIGNAGE'):draw.line((x,y+45,x,y-80),fill='#172B3A',width=10);draw.rectangle((x-30,y-85,x+40,y-45),fill='#E8F1F3',outline='#172B3A',width=4)
    else:draw.ellipse((x-55,y-30,x+55,y+30),fill='#E8F1F3',outline='#172B3A',width=5)
    draw.rectangle((0,510,960,640),fill='white')
    label(category.replace('_',' ')+(' - REPAIR ILLUSTRATION' if repair else ' - REPORT ILLUSTRATION'),22,520,2)
    label('NO MUNICIPAL ACTION REQUIRED',22,558,3)
    label('Illustrative location and evidence. Asset '+key,22,605,2)
    output=io.BytesIO();image.save(output,'JPEG',quality=89,optimize=False,progressive=False);return output.getvalue()


def prepare(plan_path,private_path,image_dir,manifest_path):
    plan=json.loads(plan_path.read_text());cfg=json.loads(private_path.read_text());cloud=cfg['cloud'];preset=cfg['preset'];image_dir.mkdir(parents=True,exist_ok=True);manifest_path.parent.mkdir(parents=True,exist_ok=True)
    assets={r['photo']:(g['category'],False) for g in plan['groups'] for r in g['reports']}
    groups={g['key']:g for g in plan['groups']}
    assets.update({e['photo']:(groups[e['group']]['category'],True) for e in plan['events'] if e['kind']=='PROOF'})
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'version':'thapar-demo-v2','cloud':cloud,'assets':{}}
    assert manifest['cloud']==cloud
    def upload(item):
        key,(category,repair)=item;data=schematic(key,category,repair);digest=hashlib.sha256(data).hexdigest();(image_dir/(key+'.jpg')).write_bytes(data)
        if key in manifest['assets']:
            value=manifest['assets'][key];assert value['sha256']==digest,'Asset definition changed; use a reviewed new dataset version';return key,value
        public_id='nagriksetu_thapar_demo_v2_'+digest[:24];boundary='----NagrikSetuDemo'+digest[:20]
        body=b''
        for name,value in [('upload_preset',preset),('public_id',public_id)]:body+=('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+value+'\r\n').encode()
        body+=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+key+'.jpg"\r\nContent-Type: image/jpeg\r\n\r\n').encode()+data+('\r\n--'+boundary+'--\r\n').encode()
        for attempt in range(3):
            try:
                request=urllib.request.Request('https://api.cloudinary.com/v1_1/'+cloud+'/image/upload',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
                with urllib.request.urlopen(request,timeout=45) as response:result=json.load(response)
                assert result['secure_url'].startswith('https://res.cloudinary.com/'+cloud+'/image/upload/')
                return key,{'url':result['secure_url'],'publicId':result['public_id'],'sha256':digest,'category':category,'synthetic':True,'repair':repair}
            except urllib.error.HTTPError as e:
                detail=e.read().decode(errors='replace')[:250]
                if e.code<500 and e.code!=429:raise RuntimeError('Synthetic asset upload refused HTTP '+str(e.code)+': '+detail) from None
                if attempt==2:raise RuntimeError('Synthetic asset upload unavailable HTTP '+str(e.code)) from None
                time.sleep(min(30,int(e.headers.get('Retry-After','3'))))
            except (TimeoutError,urllib.error.URLError):
                if attempt==2:raise RuntimeError('Synthetic asset network failure') from None
                time.sleep(2)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for future in concurrent.futures.as_completed([pool.submit(upload,item) for item in assets.items()]):
            key,value=future.result();manifest['assets'][key]=value
            temporary=manifest_path.with_suffix('.tmp');temporary.write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n');temporary.replace(manifest_path)
            print('Prepared synthetic evidence '+key,flush=True)
    assert len(manifest['assets'])==len(assets)
    print('Prepared '+str(len(assets))+' real hosted synthetic assets; backend verification is still required',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--plan',type=Path,required=True);parser.add_argument('--private-config',type=Path,required=True);parser.add_argument('--images',type=Path,required=True);parser.add_argument('--manifest',type=Path,required=True);args=parser.parse_args();prepare(args.plan,args.private_config,args.images,args.manifest)
