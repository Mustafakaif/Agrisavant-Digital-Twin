#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Starting AGRISAVANT Digital Twin dashboard on http://localhost:8743 ..."
node serve.js
