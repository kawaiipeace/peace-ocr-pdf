"use client";

import { useState, ChangeEvent, useEffect } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Document, Page, pdfjs } from "react-pdf"; // PDF rendering
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { saveAs } from "file-saver"; // File download
import { Packer, Document as DocxDocument, Paragraph } from "docx"; // DOCX export

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [numPages, setNumPages] = useState<number | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setOcrResult(null);
      setPageNumber(1);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000/ocr', formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const parsedData = response.data;
      console.log("Parsed OCR Result:", parsedData);
      setOcrResult(parsedData);
    } catch (error) {
      console.error("Error uploading file:", error);
      setOcrResult({ error: "Error occurred during OCR processing." });
    } finally {
      setLoading(false);
    }
  };

  const handleDocxExport = async () => {
    if (!ocrResult?.natural_text) return;

    const doc = new DocxDocument({
      sections: [
        {
          properties: {},
          children: ocrResult.natural_text
            .split("\n")
            .map((line: string) => new Paragraph(line)),
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, "ocr-result.docx");
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const goToPrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages || 1));

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Upload Section */}
      <div className="grid w-full max-w-sm items-center gap-2">
        <Label htmlFor="uploadfile">ระบบแปลงภาพหรือ PDF เป็นข้อความ</Label>
        <Input id="uploadfile" type="file" accept=".pdf,image/*" onChange={handleFileChange} />
      </div>

      {/* Upload Button */}
      <Button onClick={handleSubmit} disabled={loading || !file} className="mt-4">
        {loading ? "กำลังถอดข้อความ กรุณารออีกนานอยู่..." : "อัปโหลด"}
      </Button>

      {/* Loading Skeleton */}
      {loading && <Skeleton className="h-24 mt-4" />}

      {/* Display Content */}
      {file && !loading && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original File Preview */}
          <Card>
            <CardHeader>
              <CardTitle>เอกสารต้นฉบับ</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              {file.type === "application/pdf" ? (
                <div className="flex flex-col items-center">
                  <Document
                    file={file}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={<Skeleton className="h-96 w-full" />}
                  >
                    <Page pageNumber={pageNumber} width={400} renderTextLayer={false} />
                  </Document>
                  {numPages && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" onClick={goToPrevPage} disabled={pageNumber <= 1}>
                        หน้า {pageNumber - 1}
                      </Button>
                      <span>
                        หน้า {pageNumber} / {numPages}
                      </span>
                      <Button size="sm" onClick={goToNextPage} disabled={pageNumber >= numPages}>
                        หน้า {pageNumber + 1}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <img src={URL.createObjectURL(file)} alt="uploaded" className="w-full max-h-[600px]" />
              )}
            </CardContent>
          </Card>

          {/* OCR Result */}
          {ocrResult && (
            <Card>
              <CardHeader className="flex justify-between items-center">
                <CardTitle>ข้อความที่ถอดออกมาได้</CardTitle>
                <Button size="sm" variant="outline" onClick={handleDocxExport}>
                  ดาวน์โหลด Word
                </Button>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-full">
                  {ocrResult.natural_text ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {ocrResult.natural_text}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-red-500">ไม่พบข้อมูลการถอดข้อความ</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Display Additional Metadata in Accordion */}
      {ocrResult && (
        <Accordion type="single" collapsible className="mt-8">
          <AccordionItem value="additional-info">
            <details className="border p-4 rounded-md">
              <summary className="cursor-pointer font-semibold">ข้อมูลเพิ่มเติม</summary>
              <div className="mt-2 p-2 rounded">
                <p><strong>ภาษา:</strong> {ocrResult.primary_language || "ไม่ทราบภาษา"}</p>
                <p><strong>เอกสารถูกหมุนหรือไม่:</strong> {ocrResult.is_rotation_valid ? "ใช่" : "ไม่"}</p>
                <p><strong>องศาการหมุนที่ต้องแก้ไข:</strong> {ocrResult.rotation_correction || 0}°</p>
                <p><strong>เป็นตารางหรือไม่:</strong> {ocrResult.is_table ? "ใช่" : "ไม่"}</p>
                <p><strong>เป็นไดอะแกรมหรือไม่:</strong> {ocrResult.is_diagram ? "ใช่" : "ไม่"}</p>
              </div>
            </details>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
