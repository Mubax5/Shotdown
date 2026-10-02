from pathlib import Path
APP_DIR=Path.home()/'.shotdown'
PROFILE_DIR=APP_DIR/'browser_profile'
SETTINGS_FILE=APP_DIR/'settings.json'
WORK_DIR=APP_DIR/'work'

def ensure_dirs():
    for p in (APP_DIR,PROFILE_DIR,WORK_DIR):
        p.mkdir(parents=True,exist_ok=True)
