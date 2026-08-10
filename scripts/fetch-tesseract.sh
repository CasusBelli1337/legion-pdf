#!/usr/bin/env bash
#
# fetch-tesseract.sh — put a runnable Tesseract where Librarius expects one.
#
#   resources/tesseract-linux/   the binary this WSL box runs for dev and tests
#   resources/tesseract-win/     the portable Windows build electron-builder
#                                bundles into the installer, plus eng.traineddata
#
# Both directories are gitignored: binaries are fetched, never committed.
#
# The script is idempotent — a second run verifies what is already there and
# downloads nothing. It fails LOUDLY on a 404, a truncated file, or a checksum
# that does not match; a half-fetched OCR bundle that "looks fine" is exactly
# the failure this project refuses to ship.
#
# Usage:
#   scripts/fetch-tesseract.sh [--force] [--linux-only|--windows-only]
#
# Environment overrides:
#   LIBRARIUS_TESSERACT_WIN_URL        installer/archive URL for Windows
#   LIBRARIUS_TESSERACT_WIN_SHA256     pin the Windows download
#   LIBRARIUS_TESSERACT_APPIMAGE_URL   Linux AppImage URL
#   LIBRARIUS_TESSERACT_APPIMAGE_SHA256
#   LIBRARIUS_TESSDATA_ENG_URL         eng.traineddata URL
#   LIBRARIUS_TESSDATA_ENG_SHA256

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINUX_DIR="${REPO_ROOT}/resources/tesseract-linux"
WIN_DIR="${REPO_ROOT}/resources/tesseract-win"

# Pinned upstreams. Both are the projects the Tesseract maintainers point at:
# UB-Mannheim ships the canonical Windows build; AlexanderP/tesseract-appimage
# ships a self-contained Linux build for boxes with no system package.
APPIMAGE_REPO="AlexanderP/tesseract-appimage"
APPIMAGE_TAG="v5.5.2"
APPIMAGE_ASSET="tesseract-5.5.2-x86_64.AppImage"
WIN_REPO="UB-Mannheim/tesseract"
WIN_TAG="v5.4.0.20240606"
WIN_ASSET="tesseract-ocr-w64-setup-5.4.0.20240606.exe"
# The standard (legacy + LSTM) English model, pinned to the tessdata 4.1.0 tag.
TESSDATA_ENG_URL_DEFAULT="https://github.com/tesseract-ocr/tessdata/raw/4.1.0/eng.traineddata"

APPIMAGE_URL="${LIBRARIUS_TESSERACT_APPIMAGE_URL:-https://github.com/${APPIMAGE_REPO}/releases/download/${APPIMAGE_TAG}/${APPIMAGE_ASSET}}"
WIN_URL="${LIBRARIUS_TESSERACT_WIN_URL:-https://github.com/${WIN_REPO}/releases/download/${WIN_TAG}/${WIN_ASSET}}"
TESSDATA_ENG_URL="${LIBRARIUS_TESSDATA_ENG_URL:-${TESSDATA_ENG_URL_DEFAULT}}"

MIN_INSTALLER_BYTES=$((10 * 1024 * 1024))
MIN_TRAINEDDATA_BYTES=$((1024 * 1024))

FORCE=0
DO_LINUX=1
DO_WINDOWS=1

log() { printf '[fetch-tesseract] %s\n' "$*"; }
step() { printf '\n[fetch-tesseract] == %s ==\n' "$*"; }
die() {
  printf '\n[fetch-tesseract] FAILED: %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '3,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --linux-only) DO_WINDOWS=0 ;;
    --windows-only) DO_LINUX=0 ;;
    -h | --help) usage ;;
    *) die "Unknown argument: $1 (try --help)" ;;
  esac
  shift
done

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "This script needs '$1' on the PATH. Install it and re-run."
}

# --- download with real failure detection -----------------------------------

download() {
  local url="$1" target="$2"
  log "downloading ${url}"
  local status
  status="$(curl --location --fail --show-error --silent --write-out '%{http_code}' \
    --retry 3 --retry-delay 2 --connect-timeout 20 \
    --output "${target}.part" "${url}" || echo "000")"
  if [ "${status}" != "200" ]; then
    rm -f "${target}.part"
    die "${url} returned HTTP ${status} — refusing to continue with a missing file."
  fi
  [ -s "${target}.part" ] || {
    rm -f "${target}.part"
    die "${url} produced an empty file."
  }
  mv "${target}.part" "${target}"
  log "saved $(basename "${target}") ($(stat -c%s "${target}") bytes)"
}

# Verify against a pinned checksum when one is configured; otherwise record the
# checksum we DID get, so any later change to the file is caught loudly.
verify_or_record() {
  local file="$1" expected="${2:-}"
  local actual
  actual="$(sha256sum "${file}" | cut -d' ' -f1)"
  if [ -n "${expected}" ] && [ "${actual}" != "${expected}" ]; then
    die "Checksum mismatch for $(basename "${file}"): expected ${expected}, got ${actual}."
  fi
  local sidecar="${file}.sha256"
  if [ -f "${sidecar}" ]; then
    local recorded
    recorded="$(cut -d' ' -f1 <"${sidecar}")"
    [ "${recorded}" = "${actual}" ] ||
      die "$(basename "${file}") changed since it was fetched (${recorded} -> ${actual})."
  else
    printf '%s  %s\n' "${actual}" "$(basename "${file}")" >"${sidecar}"
  fi
  log "sha256 $(basename "${file}") ${actual}"
}

require_min_size() {
  local file="$1" minimum="$2" what="$3"
  local size
  size="$(stat -c%s "${file}")"
  [ "${size}" -ge "${minimum}" ] ||
    die "${what} is only ${size} bytes (expected at least ${minimum}) — the download is truncated."
}

# --- linux ------------------------------------------------------------------

verify_linux() {
  local binary="${LINUX_DIR}/tesseract"
  [ -x "${binary}" ] || [ -L "${binary}" ] || return 1
  "${binary}" --version >/dev/null 2>&1 || return 1
  log "verified: $("${binary}" --version 2>&1 | head -1)"
  return 0
}

link_system_tesseract() {
  local system
  system="$(command -v tesseract || true)"
  [ -n "${system}" ] || return 1
  log "found a system Tesseract at ${system} — linking it for development"
  ln -sfn "${system}" "${LINUX_DIR}/tesseract"
  return 0
}

# AppImages need FUSE. Where FUSE is missing (common in WSL) the AppImage is
# unpacked and a small wrapper takes its place, so the resolved path always
# behaves like a plain `tesseract` binary.
install_appimage() {
  local image="${LINUX_DIR}/tesseract.AppImage"
  if [ ! -f "${image}" ] || [ "${FORCE}" = "1" ]; then
    download "${APPIMAGE_URL}" "${image}"
  fi
  verify_or_record "${image}" "${LIBRARIUS_TESSERACT_APPIMAGE_SHA256:-}"
  chmod +x "${image}"
  if "${image}" --version >/dev/null 2>&1; then
    ln -sfn "${image}" "${LINUX_DIR}/tesseract"
    return 0
  fi
  log "the AppImage will not run directly (no FUSE?) — unpacking it instead"
  rm -rf "${LINUX_DIR}/squashfs-root"
  (cd "${LINUX_DIR}" && "${image}" --appimage-extract >/dev/null) ||
    die "Could not unpack ${image}."
  cat >"${LINUX_DIR}/tesseract" <<'WRAPPER'
#!/usr/bin/env bash
# Generated by scripts/fetch-tesseract.sh — runs the unpacked AppImage.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export TESSDATA_PREFIX="${TESSDATA_PREFIX:-${HERE}/squashfs-root/usr/share/tessdata}"
exec "${HERE}/squashfs-root/usr/bin/tesseract" "$@"
WRAPPER
  chmod +x "${LINUX_DIR}/tesseract"
}

fetch_linux() {
  step "Linux (development and tests)"
  mkdir -p "${LINUX_DIR}"
  if [ "${FORCE}" = "0" ] && verify_linux; then
    log "already present at ${LINUX_DIR}/tesseract — nothing to do"
    return 0
  fi
  link_system_tesseract || install_appimage
  verify_linux || die "The Linux Tesseract at ${LINUX_DIR}/tesseract does not answer --version."
}

# --- windows ----------------------------------------------------------------

find_archiver() {
  local candidate
  for candidate in 7zz 7z 7za 7zr; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      printf '%s' "${candidate}"
      return 0
    fi
  done
  return 1
}

extract_windows_installer() {
  local installer="$1" archiver="$2"
  log "extracting with ${archiver}"
  rm -rf "${WIN_DIR}/unpacked"
  "${archiver}" x -y -o"${WIN_DIR}/unpacked" "${installer}" >/dev/null ||
    die "${archiver} could not unpack ${installer}."
  local found
  found="$(find "${WIN_DIR}/unpacked" -iname 'tesseract.exe' -print -quit)"
  [ -n "${found}" ] || die "No tesseract.exe inside ${installer} — the layout changed upstream."
  local source_dir
  source_dir="$(dirname "${found}")"
  log "found tesseract.exe in ${source_dir#"${WIN_DIR}/"}"
  find "${source_dir}" -maxdepth 1 -type f -exec cp -f {} "${WIN_DIR}/" \;
  if [ -d "${source_dir}/tessdata" ]; then
    mkdir -p "${WIN_DIR}/tessdata"
    cp -rf "${source_dir}/tessdata/." "${WIN_DIR}/tessdata/"
  fi
  rm -rf "${WIN_DIR}/unpacked"
}

fetch_eng_traineddata() {
  local target="${WIN_DIR}/tessdata/eng.traineddata"
  mkdir -p "${WIN_DIR}/tessdata"
  if [ ! -f "${target}" ] || [ "${FORCE}" = "1" ]; then
    download "${TESSDATA_ENG_URL}" "${target}"
  fi
  require_min_size "${target}" "${MIN_TRAINEDDATA_BYTES}" "eng.traineddata"
  verify_or_record "${target}" "${LIBRARIUS_TESSDATA_ENG_SHA256:-}"
}

verify_windows() {
  # Wine is deliberately NOT required: the Windows binary is checked for
  # existence and plausible size here, and actually RUN during Windows live QA.
  local exe="${WIN_DIR}/tesseract.exe"
  [ -f "${exe}" ] || return 1
  [ -f "${WIN_DIR}/tessdata/eng.traineddata" ] || return 1
  [ "$(head -c2 "${exe}")" = "MZ" ] || die "${exe} is not a Windows executable (no MZ header)."
  log "verified: tesseract.exe ($(stat -c%s "${exe}") bytes) + eng.traineddata"
  return 0
}

fetch_windows() {
  step "Windows (packaging)"
  mkdir -p "${WIN_DIR}"
  if [ "${FORCE}" = "0" ] && verify_windows; then
    log "already present in ${WIN_DIR} — nothing to do"
    return 0
  fi
  local installer="${WIN_DIR}/$(basename "${WIN_URL}")"
  if [ ! -f "${installer}" ] || [ "${FORCE}" = "1" ]; then
    download "${WIN_URL}" "${installer}"
  fi
  require_min_size "${installer}" "${MIN_INSTALLER_BYTES}" "The Windows installer"
  verify_or_record "${installer}" "${LIBRARIUS_TESSERACT_WIN_SHA256:-}"

  local archiver
  if ! archiver="$(find_archiver)"; then
    die "The Windows build is an NSIS installer and needs 7-Zip to unpack.
       Install it and re-run this script:  sudo apt-get install -y 7zip
       (the download is kept at ${installer}, so the retry costs nothing)."
  fi
  extract_windows_installer "${installer}" "${archiver}"
  fetch_eng_traineddata
  verify_windows || die "The Windows bundle in ${WIN_DIR} is incomplete."
}

# --- main -------------------------------------------------------------------

need_cmd curl
need_cmd sha256sum
need_cmd stat

log "repository: ${REPO_ROOT}"
[ "${DO_LINUX}" = "1" ] && fetch_linux
[ "${DO_WINDOWS}" = "1" ] && fetch_windows

step "Done"
[ "${DO_LINUX}" = "1" ] && log "linux:   ${LINUX_DIR}/tesseract"
[ "${DO_WINDOWS}" = "1" ] && log "windows: ${WIN_DIR}/tesseract.exe"
log "Override the binary at runtime with LIBRARIUS_TESSERACT_PATH."
exit 0
