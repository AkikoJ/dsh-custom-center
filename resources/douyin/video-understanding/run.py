"""Use existing compatible dependencies without changing global configuration."""
import os
import re
import shutil
import sys
from pathlib import Path

for stream in (sys.stdout,sys.stderr):
    if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(os.environ.get('DOUYIN_RESOURCE_ROOT') or Path(__file__).resolve().parents[1])))
from runtime_paths import VENV
home=VENV
config=home/'pyvenv.cfg'
if config.is_file():
    version=f'{sys.version_info.major}.{sys.version_info.minor}'
    if re.search(r'(?m)^version\s*=\s*'+re.escape(version)+r'\.',config.read_text(encoding='utf-8')):
        for site in (home/'Lib/site-packages', home/'lib'/f'python{version}'/'site-packages'):
            if site.is_dir():sys.path.insert(0,str(site))
node=shutil.which('node')
if node:os.environ.setdefault('PLAYWRIGHT_NODEJS_PATH',node)
from lab import main
if __name__=='__main__':raise SystemExit(main())
