#!/usr/bin/env python3
"""Run non-secret build commands and expose failure diagnostics as CI annotations.
Do not use for commands that print credentials or authentication payloads.
"""
import subprocess, sys
result = subprocess.run(sys.argv[1:], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
print(result.stdout)
if result.returncode:
    for line in result.stdout.splitlines()[-35:]:
        message = line.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error::' + message)
sys.exit(result.returncode)
