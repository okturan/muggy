#!/bin/sh
# Builds the untouched Argonne demonstration program and the oracle driver,
# then proves the driver agrees with the original:
#   1. the demo's own output for sample-input.txt (2 m and 10 m paths) is
#      reproduced by the driver calling calc_wbgt() (fdir = -1);
#   2. the driver's restated calc_wbgt() (fdir = -2) is identical to the
#      original call for the same rows.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
build="$here/build"
mkdir -p "$build"

cc -std=gnu89 -O2 -w -x c "$here/wbgt.c.original" -lm -o "$build/liljegren-demo"
cc -std=gnu89 -O2 -w -Dmain=liljegren_demo_main -x c -c "$here/wbgt.c.original" -o "$build/wbgt.o"
cc -std=gnu99 -O2 -Wall -Wno-deprecated-non-prototype -c "$here/oracle.c" -o "$build/oracle.o"
cc "$build/oracle.o" "$build/wbgt.o" -lm -o "$build/oracle"

"$build/liljegren-demo" < "$here/sample-input.txt" > "$build/demo-out.txt"

# Re-express the sample in the driver's CSV: month = 0 means day-of-year,
# exactly as the demo passes it. Two rows per sample row: 2 m and 10 m paths.
awk 'NR==2 { lat=$1; lon=$2; year=$3; gmt=$4; avg=$5; urban=$7 }
     NR>3  { t=$2+0; h=int(t/100); m=t%100; n=NR-4
             printf "%d,%d,0,%d,%d,%d,%d,%d,%s,%s,%s,%s,%s,%s,%s,2,0,%d,%s\n",  n*4,   year,$1,h,m,gmt,avg,lat,lon,$6,$7,$9,$8,$5,urban,-1
             printf "%d,%d,0,%d,%d,%d,%d,%d,%s,%s,%s,%s,%s,%s,%s,10,%s,%d,%s\n", n*4+1, year,$1,h,m,gmt,avg,lat,lon,$6,$7,$9,$8,$4,$11,urban,-1
             printf "%d,%d,0,%d,%d,%d,%d,%d,%s,%s,%s,%s,%s,%s,%s,2,0,%d,%s\n",  n*4+2, year,$1,h,m,gmt,avg,lat,lon,$6,$7,$9,$8,$5,urban,-2
             printf "%d,%d,0,%d,%d,%d,%d,%d,%s,%s,%s,%s,%s,%s,%s,10,%s,%d,%s\n", n*4+3, year,$1,h,m,gmt,avg,lat,lon,$6,$7,$9,$8,$4,$11,urban,-2 }' \
  "$here/sample-input.txt" > "$build/sample.csv"
"$build/oracle" < "$build/sample.csv" > "$build/oracle-out.csv"

node "$here/compare-demo.mjs" "$build/demo-out.txt" "$build/oracle-out.csv"
