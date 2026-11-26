# Genera con RHVoice (voz Elena) los audios ruso que faltan en audio/ru/ y los agrega a audio/ru/index.json.
# Uso, desde cualquier carpeta:  python3 tools/audio-faltante.py            (genera lo que falta)
#                                python3 tools/audio-faltante.py --solo-contar   (solo cuenta)
# Necesita RHVoice-test (con la voz elena) y ffmpeg. La clave del índice es el texto sin acentos y el
# nombre del archivo es sha1(texto)[:12], igual que lo busca speak() en js/app.js.
import json,glob,re,hashlib,subprocess,sys,os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
idxp='audio/ru/index.json'
idx=json.load(open(idxp,encoding='utf8'))
cyr=re.compile(r'[А-Яа-яЁё]')
def clean(t):
    t=t.replace('́',''); t=re.sub(r'\(.*?\)','',t); t=re.sub(r'[/·]',',',t); t=t.replace('—',',')
    return t.strip()
def nice(s):
    t=s.strip(); c=t[:1].upper()+t[1:]
    return c if re.search(r'[.!?…]$',c) else c+'.'
want=set()
S1={'ru','texto','forma','ficha','base','de'}
S2={'fichas','distractores','cajas','caja'}
def add(t):
    if isinstance(t,str) and cyr.search(t):
        c=clean(t)
        if c: want.add(c)
def walk(o,k=None):
    if isinstance(o,dict):
        for kk,v in o.items():
            if kk=='bloques' and isinstance(v,list):
                for b in v:
                    if isinstance(b,list) and all(isinstance(x,str) for x in b): add(' '.join(b))
            if kk=='validas' and isinstance(v,list):
                for x in v:
                    if isinstance(x,str): add(nice(x))
            walk(v,kk)
    elif isinstance(o,list):
        for v in o:
            if isinstance(v,str) and k in S2: add(v)
            else: walk(v,k)
    elif isinstance(o,str) and k in S1: add(o)
for f in glob.glob('data/**/*.json',recursive=True): walk(json.load(open(f,encoding='utf8')))
miss=sorted(t for t in want if t not in idx)
print('querida',len(want),'faltan',len(miss))
if '--solo-contar' in sys.argv: sys.exit()
ok=0
for t in miss:
    i=hashlib.sha1(t.encode()).hexdigest()[:12]
    out=f'audio/ru/{i}.mp3'
    if os.path.exists(out): idx[t]=i; continue
    w=subprocess.run(['RHVoice-test','-p','elena','-o','/tmp/g.wav'],input=t.encode(),capture_output=True)
    if w.returncode: print('FALLO',t); continue
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i','/tmp/g.wav','-ac','1','-ar','22050','-b:a','40k',out],check=True)
    idx[t]=i; ok+=1
json.dump(idx,open(idxp,'w',encoding='utf8'),ensure_ascii=False,separators=(',',':'))
print('generados',ok)
