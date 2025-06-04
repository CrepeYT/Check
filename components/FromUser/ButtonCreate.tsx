"use client"; // บอกให้ Next.js รู้ว่านี่เป็น Client Component


// นำเข้า React Hooks สำหรับจัดการ state และ lifecycle
import { useState, useEffect, useRef, ChangeEvent } from "react";

// นำเข้าการเชื่อมต่อฐานข้อมูล Firebase
import { db } from "@/lib/firebase";

// นำเข้าฟังก์ชันต่างๆ จาก Firestore สำหรับการดำเนินการกับข้อมูล
import { collection, addDoc, Timestamp, updateDoc, arrayUnion, doc, getDoc } from "firebase/firestore";

// นำเข้า Component สำหรับแสดงรูปภาพจาก Next.js
import Image from "next/image";

// นำเข้า Hook สำหรับจัดการข้อมูลผู้ใช้จาก Clerk Authentication
import { useUser } from "@clerk/nextjs";

// นำเข้าไอคอนปิดจาก React Icons
import { FaTimes } from "react-icons/fa";

// นำเข้าฟังก์ชันต่างๆ สำหรับจัดการกล้องและสแกน QR Code
import { openCamera, scanQRCode, stopCamera } from "@/utils/camera";



// กำหนด Interface สำหรับ Props ของ Component
interface AddClassPopupProps {
  onScanSuccess?: () => void; // ฟังก์ชันที่จะเรียกเมื่อสแกน QR Code สำเร็จ (optional)
}

// สร้าง Functional Component ชื่อ AddClassPopup
const AddClassPopup: React.FC<AddClassPopupProps> = ({ onScanSuccess }) => {
  // State variables สำหรับจัดการสถานะต่างๆ
  //------------------------------------------------------------------------------------------------
  // สร้าง Reference สำหรับ Canvas element ที่ใช้ในการแสดงผลการสแกน QR Code
  const canvasRef = useRef<HTMLCanvasElement>(null);


  //------------------------------------------------------------------------------------------------

  // สร้าง Reference สำหรับ Video element ที่ใช้แสดงภาพจากกล้อง
  const videoRef = useRef<HTMLVideoElement>(null);

  // State สำหรับควบคุมสถานะการสแกน QR Code (เปิด/ปิด)
  const [scanning, setScanning] = useState(false);

  // State สำหรับควบคุมการแสดง popup สร้างคลาส (เปิด/ปิด)
  const [showPopup, setShowPopup] = useState(false);

  // State สำหรับเก็บชื่อคลาสที่ผู้ใช้กรอก
  const [className, setClassName] = useState("");

  // State สำหรับแสดงสถานะการโหลด (กำลังดำเนินการ/เสร็จสิ้น)
  const [loading, setLoading] = useState(false);

  // State สำหรับเก็บข้อความแสดงข้อผิดพลาด
  const [error, setError] = useState<string | null>(null);

  // State สำหรับเก็บ ID ของคลาสที่สร้างขึ้น
  const [classId, setClassId] = useState<string | null>(null);

  // ดึงข้อมูลผู้ใช้และสถานะการล็อกอินจาก Clerk
  const { user, isSignedIn } = useUser();

  // ฟังก์ชันสำหรับจัดการเมื่อสแกน QR Code สำเร็จ
  const handleQRDetected = async (result: { data: string }) => {



    try {

      // ปิดกล้องทันทีเมื่อสแกนเสร็จ
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stopCamera(stream);
        videoRef.current.srcObject = null;
      }

      // ปิดสถานะการสแกน
      setScanning(false);

      // แปลง QR Code ที่สแกนได้เป็น URL object
      const url = new URL(result.data);

      // ดึง Class ID จากส่วนท้ายของ URL path
      const classId = url.pathname.split('/').pop();

      // ตรวจสอบว่ามี Class ID และผู้ใช้ล็อกอินแล้วหรือไม่
      if (!classId || !user) {
        alert('ไม่สามารถเช็คชื่อได้ กรุณาลองใหม่'); // แสดงข้อความเตือน
        return; // หยุดการทำงาน
      }

      // เริ่มสถานะการโหลด
      setLoading(true);

      // สร้าง Reference ไปยังเอกสารคลาสใน Firestore
      const classRef = doc(db, "classes", classId);

      // ดึงข้อมูลคลาสจาก Firestore
      const classDoc = await getDoc(classRef);

      // ตรวจสอบว่าคลาสมีอยู่จริงหรือไม่
      if (classDoc.exists()) {
        // ดึงข้อมูลของคลาส
        const classData = classDoc.data();

        // ดึงรายชื่อสมาชิกที่เช็คชื่อแล้ว (หากไม่มีให้เป็น array ว่าง)
        const checkedInMembers = classData.checkedInMembers || [];

        // ตรวจสอบว่าผู้ใช้เช็คชื่อไปแล้วหรือยัง
        if (checkedInMembers.includes(user.id)) {
          alert('คุณได้เช็คชื่อไปแล้ว!'); // แสดงข้อความแจ้งเตือน
          return; // หยุดการทำงาน
        }

        // อัปเดตข้อมูลคลาสในฐานข้อมูล
        await updateDoc(classRef, {
          // เพิ่ม ID ผู้ใช้เข้าไปในรายชื่อที่เช็คชื่อแล้ว
          checkedInMembers: arrayUnion(user.id),
          // อัปเดตจำนวนคนที่เช็คชื่อแล้ว
          checkedInCount: checkedInMembers.length + 1,
          // บันทึกเวลาที่เช็คชื่อล่าสุด
          lastCheckedIn: Timestamp.now()
        });
        alert('เช็คชื่อสำเร็จ!'); // แสดงข้อความแจ้งความสำเร็จ
        onScanSuccess?.(); // เรียกฟังก์ชัน callback (หากมี) เมื่อสแกนสำเร็จ
      }
    } catch (error) {
      // จับและแสดง error หากเกิดข้อผิดพลาด
      console.error('Error:', error);
      alert('เกิดข้อผิดพลาดในการเช็คชื่อ');
    } finally {
      // ดำเนินการในส่วน finally (ไม่ว่าจะสำเร็จหรือไม่)
      setLoading(false); // หยุดสถานะการโหลด
    }
  };

  // useEffect Hook สำหรับจัดการการเปิด/ปิดกล้องและการสแกน QR Code
  useEffect(() => {
    // ตัวแปรสำหรับเก็บ Media Stream ปัจจุบัน
    let currentStream: MediaStream | null = null;

    // ตรวจสอบว่าอยู่ในสถานะการสแกนและมี video, canvas elements
    if (scanning && videoRef.current && canvasRef.current) {
      // เปิดกล้องและเริ่มการสแกน
      openCamera(videoRef.current).then((stream) => {
        // เริ่มการสแกน QR Code โดยส่ง elements และ callback functions
        const scanner = scanQRCode(
          videoRef.current!, // Video element (! หมายถึงมั่นใจว่าไม่เป็น null)
          canvasRef.current!, // Canvas element
          handleQRDetected, // ฟังก์ชันที่จะเรียกเมื่อสแกนสำเร็จ
          (error: any) => { // ฟังก์ชันที่จะเรียกเมื่อเกิดข้อผิดพลาด
            console.error("เกิดข้อผิดพลาดในการสแกน:", error);
            alert(error);
          }
        );

        // ฟังก์ชัน Cleanup เมื่อปิดการสแกน
        return () => {
          // หยุดการทำงานของ scanner หากมี
          if (scanner) {
            scanner.stop();
          }
          // หยุดการทำงานของกล้องหากมี stream
          if (currentStream) {
            stopCamera(currentStream);
            currentStream = null;
          }
        };
      }).catch((error) => {
        // จัดการข้อผิดพลาดการเปิดกล้อง
        console.error("ไม่สามารถเปิดกล้องได้:", error);
        alert("ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบการอนุญาตการใช้งานกล้อง");
        setScanning(false); // ปิดสถานะการสแกน
      });

      // ฟังก์ชัน Cleanup ของ useEffect
      return () => {
        // หยุดกล้องหากมี stream ทำงานอยู่
        if (currentStream) {
          stopCamera(currentStream);
          currentStream = null;
        }
      };
    }
  }, [scanning]); // dependency array - useEffect จะทำงานเมื่อ scanning state เปลี่ยน

  // ฟังก์ชันสำหรับสร้างคลาสใหม่
  const handleCreateClass = async () => {
    // ตรวจสอบว่าผู้ใช้กรอกชื่อคลาสหรือไม่ (trim() เพื่อลบช่องว่างหน้า-หลัง)
    if (!className.trim()) {
      setError("กรุณากรอกชื่อคลาสก่อน"); // ตั้งค่าข้อความผิดพลาด
      return; // หยุดการทำงาน
    }

    // ตรวจสอบว่าผู้ใช้ล็อกอินแล้วหรือไม่
    if (!isSignedIn || !user) {
      setError("คุณยังไม่ได้ล็อกอิน"); // ตั้งค่าข้อความผิดพลาด
      return; // หยุดการทำงาน
    }

    try {
      setLoading(true); // เริ่มสถานะการโหลด
      setError(null); // ล้างข้อความผิดพลาดก่อนหน้า

      // ดึงข้อมูลผู้ใช้
      const userId = user.id; // ID ของผู้ใช้
      const userEmail = user.primaryEmailAddress?.emailAddress || ""; // อีเมลของผู้ใช้

      // สร้างเอกสารคลาสใหม่ใน Firestore collection "classes"
      const docRef = await addDoc(collection(db, "classes"), {
        name: className.trim(), // ชื่อคลาส (ลบช่องว่างหน้า-หลัง)
        created_by: userId, // ID ของผู้สร้างคลาส
        created_at: Timestamp.fromDate(new Date()), // วันที่และเวลาที่สร้าง
        members: [userId], // รายชื่อสมาชิกในคลาส (เริ่มต้นด้วยผู้สร้าง)
        memberCount: 1, // จำนวนสมาชิกในคลาส
        checkedInCount: 0,  // จำนวนคนที่เช็คชื่อแล้ว (เริ่มต้น 0)
        checkedInMembers: [], // รายชื่อสมาชิกที่เช็คชื่อแล้ว (เริ่มต้นว่าง)
        owner_email: userEmail, // อีเมลของเจ้าของคลาส
        last_updated: Timestamp.fromDate(new Date()), // วันที่และเวลาที่อัปเดตล่าสุด
      });

      // setSuccess(true); // บรรทัดนี้ถูก comment ไว้ - อาจใช้สำหรับแสดงสถานะความสำเร็จ
      setClassName(""); // ล้างข้อมูลชื่อคลาสใน input field

    } catch (error) {
      // จัดการข้อผิดพลาดในการสร้างคลาส
      console.error("Error details:", error);
      // แสดงข้อความผิดพลาดที่เหมาะสม
      setError(`เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false); // จบสถานะการโหลด (ทำงานไม่ว่าจะสำเร็จหรือไม่)
    }
  };

  // ส่วนนี้เป็น comment ของฟังก์ชันอัปโหลด CSV (ถูก comment ทั้งหมด)
  // // ฟังก์ชันสำหรับอัปโหลดไฟล์ CSV ข้อมูลนักเรียน
  // const handleUploadCSV = async (event: ChangeEvent<HTMLInputElement>) => {
  //   const file = event.target.files?.[0];
  //   if (!file) return; // ถ้าไม่มีไฟล์ให้หยุด

  //   // ตรวจสอบว่ามี classId หรือไม่
  //   if (!classId) {
  //     alert("กรุณาสร้างคลาสก่อนอัปโหลดนักเรียน");
  //     return;
  //   }

  //   const reader = new FileReader();
  //   reader.onload = async (e) => {
  //     const text = e.target?.result;
  //     if (typeof text !== "string") return;

  //     // แยกข้อมูลแต่ละบรรทัดใน CSV
  //     const lines = text.split("\n");
  //     for (const line of lines) {
  //       const [name, studentId, major] = line.trim().split(",");

  //       // ถ้ามีข้อมูลครบถ้วนให้บันทึกลง Firebase
  //       if (name && studentId && major) {
  //         await addDoc(collection(db, "students"), {
  //           name, // ชื่อนักเรียน
  //           studentId, // รหัสนักเรียน
  //           major, // สาขาวิชา
  //           classId, // ID ของคลาส
  //           createdAt: Timestamp.now(), // วันที่สร้าง
  //         });
  //       }
  //     }
  //     alert("อัปโหลดข้อมูลนักเรียนสำเร็จ!");
  //   };

  //   reader.readAsText(file); // อ่านไฟล์เป็นข้อความ
  // };

  // ฟังก์ชันสำหรับปิด popup สร้างคลาส
  const closePopup = () => {
    setShowPopup(false); // ปิด popup
    setClassName(""); // ล้างชื่อคลาส
    setError(null); // ล้างข้อความผิดพลาด
    setScanning(false); // ปิดการสแกน
    // setSuccess(false); // บรรทัดนี้ถูก comment ไว้ - อาจใช้สำหรับรีเซ็ตสถานะความสำเร็จ
  };

  // ส่วน JSX ที่จะ render
  return (
    <div className=""> {/* Container หลัก */}
      {/* ส่วนปุ่มต่างๆ ด้านบน */}
      <div className="h-0 md:flex md:flex-col md:-mx-34 md:-mt-15 max-md:mx-5 max-md:flex max-md:flex-row max-md:justify-center max-md:items-center max-md:gap-2 max-md:-mt-26 max-md:mb-26 max-md:h-0">
        {/* ปุ่มสแกน QR code */}
        <button
          className="w-20 h-auto border-purple-600 text-purple-600 py-1 rounded-2xl hover:bg-purple-100 md:mb-2 border md:ml-2" // CSS classes สำหรับการจัดแต่งปุ่ม
          onClick={() => setScanning(true)} // เมื่อคลิกให้เริ่มการสแกน
        >
          Scan QR {/* ข้อความในปุ่ม */}
        </button>

        {/* ปุ่มเพิ่มคลาส */}
        <button
          className="w-25 h-auto border border-purple-600 text-purple-600 py-1 rounded-2xl hover:bg-purple-100 " // CSS classes สำหรับการจัดแต่งปุ่ม
          onClick={() => setShowPopup(true)} // เมื่อคลิกให้แสดง popup สร้างคลาส
        >
          Add a class {/* ข้อความในปุ่ม */}
        </button>
      </div>

      {/* Popup สำหรับสร้างคลาสใหม่ - แสดงเมื่อ showPopup เป็น true */}
      {showPopup && (
        <div className="fixed inset-0 bg-[rgba(0,0,0,0.5)] flex items-center justify-center z-50"> {/* Overlay พื้นหลังโปร่งใส */}
          <div className="bg-white rounded-3xl shadow-lg p-6 relative max-w-2xl w-full  overflow-hidden"> {/* กล่อง popup หลัก */}
            {/* วงกลมสีม่วงที่มุมขวาบน - เป็นองค์ประกอบการตัดแต่ง */}
            <div className="absolute -top-16 -right-16 w-35 h-35 bg-purple-500 rounded-full"></div>

            {/* ปุ่มปิด modal - วางไว้บนวงกลมสีม่วง */}
            <button
              onClick={closePopup} // เมื่อคลิกให้ปิด popup
              className="absolute top-2 right-2 z-10 text-white hover:text-gray-200 transition-colors" // จัดตำแหน่งและสี
            >
              {/* ไอคอน X สำหรับปิด */}
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>

            <div className="flex"> {/* Container สำหรับจัดเรียงเนื้อหาในแนวนอน */}
              {/* พื้นหลังสีม่วงโค้งมน - องค์ประกอบตกแต่ง */}
              <div className="absolute -bottom-50 right-120 w-100 h-100 bg-purple-500 rounded-full "></div>

              {/* รูปภาพนักเรียน */}
              <div className="absolute -bottom-2"> {/* จัดตำแหน่งรูปภาพ */}
                <Image
                  src="/assets/images/person.png" // ที่อยู่ไฟล์รูปภาพ
                  width={150} // ความกว้าง
                  height={150} // ความสูง
                  alt="Student thinking" // ข้อความ alt สำหรับ accessibility
                  className="object-contain relative z-10" // CSS สำหรับการแสดงผล
                />
              </div>

              {/* ส่วนขวา - ฟอร์มสำหรับกรอกข้อมูล */}
              <div className="w-1/2 p-8 flex flex-col justify-center ml-70"> {/* Container ฟอร์ม */}
                <div className="bg-white p-6 rounded-2xl shadow-lg"> {/* กล่องฟอร์ม */}
                  {/* หัวข้อฟอร์ม */}
                  <h2 className="text-purple-700 font-bold text-xl mb-6 flex items-center gap-2">
                    <span>🏠</span> ชื่อคลาส {/* ไอคอน emoji และข้อความ */}
                  </h2>

                  {/* ป้ายกำกับสำหรับ input field */}
                  <label className="block text-purple-600 text-sm mb-2">
                    ชื่อคลาส
                  </label>

                  {/* ช่องกรอกชื่อคลาส */}
                  <input
                    type="text" // ประเภท input
                    value={className} // ค่าที่แสดงใน input (จาก state)
                    onChange={(e) => { // ฟังก์ชันที่ทำงานเมื่อมีการเปลี่ยนแปลงค่า
                      setClassName(e.target.value); // อัปเดต state ชื่อคลาส
                      setError(null); // ล้างข้อความผิดพลาดเมื่อกรอกข้อมูลใหม่
                    }}
                    placeholder="ชื่อคลาส" // ข้อความแสดงเมื่อยังไม่ได้กรอก
                    className="w-full border-2 border-purple-200 rounded-4xl px-4 py-3 mb-6 focus:outline-none focus:border-purple-400" // CSS สำหรับ styling
                  />

                  {/* แสดงข้อความแสดงข้อผิดพลาด - แสดงเมื่อมี error */}
                  {error && (
                    <div className="text-red-500 mb-4 text-sm">{error}</div>
                  )}

                  {/* ปุ่มสร้างคลาส */}
                  <div className="p-5"> {/* Container สำหรับปุ่ม */}
                    <button
                      onClick={handleCreateClass} // ฟังก์ชันที่เรียกเมื่อคลิก
                      disabled={loading} // ปิดการใช้งานปุ่มเมื่อกำลังโหลด
                      className="w-full bg-purple-500 text-white py-3 rounded-xl font-medium hover:bg-purple-600 transition-colors" // CSS styling
                    >
                      {loading ? "กำลังสร้าง..." : "สร้าง"} {/* ข้อความปุ่มเปลี่ยนตามสถานะการโหลด */}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* หน้าจอสแกน QR Code - แสดงเมื่อ scanning เป็น true */}
      {scanning && (
        <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50"> {/* หน้าจอเต็มจอสำหรับการสแกน */}
          <div className="relative"> {/* Container สำหรับ video และ canvas */}
            {/* Video element สำหรับแสดงภาพจากกล้อง */}
            <video
              ref={videoRef} // เชื่อมต่อกับ useRef
              autoPlay // เล่นอัตโนมัติ
              playsInline // เล่นแบบ inline (สำหรับมือถือ)
              style={{ width: '100%', maxWidth: '640px' }} // กำหนดขนาด
            />

            {/* Canvas element สำหรับวาดกรอบการสแกน */}
            <canvas
              ref={canvasRef} // เชื่อมต่อกับ useRef
              style={{
                position: 'absolute', // วางทับบน video
                top: 0,
                left: 0,
                width: '100%',
                height: '100%'
              }}
            />
          </div>

          {/* ปุ่มปิดการสแกน */}
          <button
            className="absolute top-2 right-1 text-purple-500 hover:text-purple-700" // จัดตำแหน่งและสี
            onClick={() => { // ฟังก์ชันเมื่อคลิกปิด
              setScanning(false); // ปิดสถานะการสแกน

              // ถ้ามี video stream อยู่ให้หยุดการทำงาน
              if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream; // แปลงเป็น MediaStream
                stopCamera(stream); // หยุดกล้อง
                videoRef.current.srcObject = null; // ล้าง video source
              }
            }}
          >
            <FaTimes size={40} /> {/* ไอคอนปิด ขนาด 40px */}
          </button>
        </div>
      )}
    </div>
  )
};

// ส่งออก Component เป็น default export
export default AddClassPopup;