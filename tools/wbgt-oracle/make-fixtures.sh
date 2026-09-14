#!/bin/sh
# Builds and verifies the Argonne oracle, then regenerates
# test/fixtures/wbgt-grid.json. The fixture is committed so tests never need
# a C compiler.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
sh "$here/verify.sh"
node "$here/make-fixtures.mjs"
