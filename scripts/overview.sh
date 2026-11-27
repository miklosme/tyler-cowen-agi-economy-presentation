#!/usr/bin/env bash
# Tile settled slide frames into one overview image: overview.sh <dir> <frame-suffix> <out.png> [cols]
set -euo pipefail
dir=$1; suffix=$2; out=$3; cols=${4:-4}
files=($(ls "$dir"/slide-*-"$suffix".png | sort))
n=${#files[@]}
inputs=(); scale=""; layout=""; stack=""
for i in "${!files[@]}"; do
  inputs+=(-i "${files[$i]}")
  scale+="[$i:v]scale=640:360[s$i];"
  x=$(( (i % cols) * 640 )); y=$(( (i / cols) * 360 ))
  layout+="${x}_${y}|"; stack+="[s$i]"
done
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "${scale}${stack}xstack=inputs=$n:layout=${layout%|}:fill=black[out]" -map "[out]" "$out"
echo "$out"
