#!/usr/bin/env python3
"""Run non-secret build commands and expose failure diagnostics as CI annotations.
Do not use for commands that print credentials or authentication payloads.
"""
import subprocess, sys
result = subprocess.run(sys.argv[1:], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
print(result.stdout)
if result.returncode:
    lines = result.stdout.splitlines()
    important = ['\n'.join(lines[i:i+14]) for i,line in enumerate(lines) if any(word in line.lower() for word in ['error', 'failed assertion', 'exception caught', '(failed)'])]
    for line in (important + lines[-5:])[:10]:
        message = line.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error::' + message)
else:
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if lines:
        print('::notice::' + lines[-1].replace('%', '%25').replace('\r', '%0D'))
sys.exit(result.returncode)
