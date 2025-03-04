"use client";

import { useState, ChangeEvent } from "react";
import axios from "axios";

// Define types for state variables
interface OcrResult {
  text: string[];
}

export default function Home() {
  // State for PDF file, OCR result, and loading state
  const [pdf, setPdf] = useState<File | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Handle file input change
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; // Get the first selected file
    if (file) {
      setPdf(file);
    }
  };

  // Handle file submission to backend
  const handleSubmit = async () => {
    if (!pdf) return;

    setLoading(true);

    // Create FormData to send the file to the backend
    const formData = new FormData();
    formData.append("pdf", pdf);

    try {
      // Send the request to the FastAPI backend
      const response = await axios.post(
        "http://127.0.0.1:8000/ocr", // Backend URL
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      // Set OCR result in state
      setOcrResult(response.data);
    } catch (error) {
      console.error("Error uploading PDF:", error);
      setOcrResult({ text: ["Error occurred during OCR processing."] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Thai OCR with TrOCR</h1>

      {/* File input */}
      <input type="file" accept=".pdf" onChange={handleFileChange} />

      {/* Button to trigger OCR process */}
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? "Processing..." : "Upload and Process"}
      </button>

      {/* Display OCR result */}
      {ocrResult && (
        <div>
          <h2>OCR Result</h2>
          <pre>{ocrResult.text.join("\n")}</pre>
        </div>
      )}
    </div>
  );
}
