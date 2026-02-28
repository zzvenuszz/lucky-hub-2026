
import cv2
import face_recognition
import os
import sys
import time

# Lấy đường dẫn thư mục chứa ảnh từ tham số dòng lệnh
if len(sys.argv) < 2:
    print("Error: Missing faces directory path")
    sys.exit(1)

FACES_DIR = sys.argv[1]

# Danh sách chứa encoding và tên tương ứng
known_face_encodings = []
known_face_names = []

def load_faces():
    global known_face_encodings, known_face_names
    known_face_encodings = []
    known_face_names = []
    
    print(f"Loading faces from {FACES_DIR}...")
    for filename in os.listdir(FACES_DIR):
        if filename.endswith(".jpg") or filename.endswith(".png"):
            username = os.path.splitext(filename)[0]
            image_path = os.path.join(FACES_DIR, filename)
            try:
                image = face_recognition.load_image_file(image_path)
                encodings = face_recognition.face_encodings(image)
                if len(encodings) > 0:
                    known_face_encodings.append(encodings[0])
                    known_face_names.append(username)
                    print(f"Loaded: {username}")
                else:
                    print(f"Warning: No face found in {filename}")
            except Exception as e:
                print(f"Error loading {filename}: {str(e)}")

# Load ảnh lần đầu
load_faces()

# Mở webcam
video_capture = cv2.VideoCapture(0)

if not video_capture.isOpened():
    print("Error: Could not open webcam")
    sys.exit(1)

print("Face recognition started...")

last_detected = None
last_time_detected = 0

while True:
    # Đọc frame từ webcam
    ret, frame = video_capture.read()
    if not ret:
        break

    # Giảm kích thước frame để xử lý nhanh hơn (tùy chọn)
    small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
    rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

    # Tìm khuôn mặt trong frame hiện tại
    face_locations = face_recognition.face_locations(rgb_small_frame)
    face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

    current_detected = None

    for face_encoding in face_encodings:
        # So sánh với danh sách đã biết
        matches = face_recognition.compare_faces(known_face_encodings, face_encoding, tolerance=0.6)
        name = "UNKNOWN"

        if True in matches:
            first_match_index = matches.index(True)
            name = known_face_names[first_match_index]
            current_detected = name
            break # Chỉ lấy người đầu tiên nhận diện được

    # Logic gửi kết quả về Magic Mirror
    now = time.time()
    if current_detected:
        if current_detected != last_detected:
            print(f"DETECTED:{current_detected}")
            sys.stdout.flush()
            last_detected = current_detected
        last_time_detected = now
    else:
        # Nếu không thấy ai trong 3 giây, báo USER_LOST
        if last_detected and (now - last_time_detected > 3):
            print("UNKNOWN")
            sys.stdout.flush()
            last_detected = None

    # Nghỉ một chút để giảm tải CPU
    time.sleep(0.5)

video_capture.release()
