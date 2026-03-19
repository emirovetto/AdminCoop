@echo off
setlocal
cd /d C:\Users\Noxi-PC\Documents\AdminCoop
if not exist .run mkdir .run
call "C:\Program Files\nodejs\npm.cmd" run preview > .run\preview-live.out.log 2> .run\preview-live.err.log
