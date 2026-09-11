#!/usr/bin/env bash
# A wrapper over tools/build/build.js, which is the build.
#
# This script and build.ps1 used to hold the same recipe twice, in two dialects,
# and had drifted -- different line endings in dist/*.html, a different archive
# tool, a different rule for when to push. They translate flags now and nothing
# else, so there is one build and both shells run it.
#
#   ./build.sh [-c CHANNEL] [-a] [-d DEVICE]

cd "$(dirname "$0")" || exit 1

while getopts ":ac:d:" opt; do
  case $opt in
    a) ADB="true"
    ;;
    c) CHANNEL="$OPTARG"
    ;;
    d) DEVICE="$OPTARG"
    ;;
    \?) echo "Invalid option -$OPTARG" >&2
    exit 1
    ;;
  esac

  case $OPTARG in
    -*) echo "Option $opt needs a valid argument"
    exit 1
    ;;
  esac
done

ARGS=()
[ -n "${CHANNEL:-}" ] && ARGS+=(--channel "$CHANNEL")
[ "${ADB:-}" = "true" ] && ARGS+=(--adb)
[ -n "${DEVICE:-}" ] && ARGS+=(--device "$DEVICE")

exec node tools/build/build.js "${ARGS[@]}"
