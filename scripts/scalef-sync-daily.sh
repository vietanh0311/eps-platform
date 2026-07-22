#!/bin/bash
# Đồng bộ ScaleF, chạy tự động trên máy local — cùng pattern với vcd-clean/scripts/daily-sync.sh.
#
# CÁCH HOẠT ĐỘNG: launchd gọi script này mỗi 30 phút. Script tự quyết định có chạy hay không:
#   - Hôm nay đã sync thành công rồi -> thoát ngay, không làm gì.
#   - Chưa sync                      -> chạy `npm run scalef:sync`, đánh dấu xong nếu thành công.
#
# Nhờ vậy không cần hẹn giờ cứng, và máy tắt/ngủ cả ngày thì hôm đó bỏ qua, hôm sau tự chạy tiếp.
#
# Cài đặt:
#   cp scripts/com.vietanh.eps-scalef-sync.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/com.vietanh.eps-scalef-sync.plist
# Gỡ:
#   launchctl unload ~/Library/LaunchAgents/com.vietanh.eps-scalef-sync.plist
# Chạy thử ngay:
#   launchctl start com.vietanh.eps-scalef-sync

set -uo pipefail

PROJECT_DIR="/Users/VietAnh/Claude/eps-platform"
NODE_BIN_DIR="/Users/VietAnh/.nvm/versions/node/v24.18.0/bin"

STATE_FILE="$PROJECT_DIR/.scalef-sync-state"
LOG_FILE="$PROJECT_DIR/scalef-sync.log"
LOCK_DIR="$PROJECT_DIR/.scalef-sync-lock"

# launchd chạy với PATH tối thiểu, không có nvm -> phải chỉ đường dẫn node.
export PATH="$NODE_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$PROJECT_DIR" || exit 1

TODAY=$(date +%F)

if [ -f "$STATE_FILE" ] && [ "$(cat "$STATE_FILE" 2>/dev/null)" = "$TODAY" ]; then
  exit 0 # hôm nay sync rồi
fi

log() {
  echo "[$(date '+%F %H:%M:%S')] $1" >>"$LOG_FILE"
}

# KHOÁ: launchd gọi script mỗi 30 phút, và có thể chạy tay bất cứ lúc nào — không khoá thì nhiều
# lượt sync chạy chồng lên nhau (đã có bug y hệt bên vcd-clean, không phải phòng xa).
# syncScalef() tự có pg_try_advisory_lock ở tầng DB rồi, khoá file ở đây là lớp ngoài rẻ tiền,
# tránh spam log/gọi API ScaleF trùng lặp khi 2 tiến trình cùng khởi động gần nhau.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    exit 0 # đang có lượt sync chạy - im lặng nhường
  fi
  log "Phát hiện khoá mồ côi (PID ${LOCK_PID:-?} không còn) - thu hồi."
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" 2>/dev/null || exit 0
fi
echo $$ >"$LOCK_DIR/pid"

trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM

log "Bắt đầu đồng bộ ScaleF..."

if npm run --silent scalef:sync >>"$LOG_FILE" 2>&1; then
  echo "$TODAY" >"$STATE_FILE"
  log "XONG - đã đánh dấu hoàn thành cho $TODAY."
else
  # Không đánh dấu -> 30 phút nữa launchd gọi lại, sẽ tự thử lại. Lý do lỗi cụ thể đã in ở log
  # phía trên (từ scripts/sync-scalef.ts) — không đoán bừa ở đây.
  log "THẤT BẠI - lý do cụ thể ở ngay phía trên. Sẽ tự thử lại sau 30 phút."
fi

# Giữ log gọn: chỉ giữ 2000 dòng cuối.
if [ -f "$LOG_FILE" ]; then
  tail -n 2000 "$LOG_FILE" >"$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
