"""Enable a paper/code link when that resource is ready for publication."""
from pathlib import Path
from urllib.parse import urlparse
import argparse
import json

parser=argparse.ArgumentParser()
parser.add_argument('--paper',help='HTTPS URL of the published paper.')
parser.add_argument('--code',help='HTTPS URL of the released research code.')
parser.add_argument('--author',action='append',help='Public author name; repeat for multiple authors.')
args=parser.parse_args()
if not any([args.paper,args.code,args.author]):parser.error('Provide --paper, --code, or --author.')
path=Path(__file__).resolve().parents[1]/'docs/content.json'
config=json.loads(path.read_text(encoding='utf-8'))
for value,key in [(args.paper,'paperUrl'),(args.code,'codeUrl')]:
    if value:
        url=urlparse(value)
        if url.scheme!='https' or not url.netloc:parser.error('Publication links must be complete HTTPS URLs.')
        config['project'][key]=value
if args.author:
    config['project']['authors']=args.author
    config['project']['anonymous']=False
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Updated docs/content.json. Commit and push when ready to publish these changes.')
