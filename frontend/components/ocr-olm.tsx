"use client";

import { useState, ChangeEvent } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Define types for state variables
interface OcrResult {
    natural_text: string; // OCR text
    primary_language: string;
    is_rotation_valid: boolean;
    rotation_correction: number;
    is_table: boolean;
    is_diagram: boolean;
    //text: string[] | string; // Allow both array or string
}

const markdownTableToHtml = (markdown: string) => {
    // Simple conversion for markdown tables to HTML tables
    const tableRegex = /\|([^\|]+)\|/g;
    const rows = markdown.split("\n").map((line) => {
        const matches = line.match(tableRegex);
        if (matches) {
            const row = matches.map((match) => `<td>${match.slice(1, -1)}</td>`).join("");
            return `<tr>${row}</tr>`;
        }
        return "";
    });

    return `<table border="1">${rows.join("")}</table>`;
};

const formatNaturalText = (text: string) => {
    // Split the text into paragraphs based on double line breaks
    const paragraphs = text.split("\n\n").map((para, idx) => {
        // Check if this paragraph contains a markdown table
        if (para.includes("|")) {
            // If it contains a table, convert it
            return markdownTableToHtml(para);
        }
        // Otherwise, return as plain text
        return `<p>${para}</p>`;
    });

    return paragraphs.join("");
};

export default function Home() {
    // State for PDF file, OCR result, and loading state
    const [pdf, setPdf] = useState<File | null>(null);
    const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [isAccordionOpen, setAccordionOpen] = useState<boolean>(false); // To toggle the accordion

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

            if (response.data.natural_text) {
                // Include the whole OCR result, not just the text
                setOcrResult(response.data);
            } else {
                setOcrResult({
                    natural_text: "Unexpected response format.",
                    primary_language: "",
                    is_rotation_valid: false,
                    rotation_correction: 0,
                    is_table: false,
                    is_diagram: false,
                });
            }
        } catch (error) {
            console.error("Error uploading PDF:", error);
            setOcrResult({
                natural_text: "Error occurred during OCR processing.",
                primary_language: "",
                is_rotation_valid: false,
                rotation_correction: 0,
                is_table: false,
                is_diagram: false,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="uploadfile">ระบบแปลงภาพหรือ PDF เป็นข้อความ</Label>
                <Input id="uploadfile" type="file" accept=".pdf,image/*" onChange={handleFileChange} />
            </div>

            {/* Button to trigger OCR process */}
            <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Processing..." : "Upload and Process"}
            </Button>

            {/* Display OCR result */}
            {ocrResult && (
                <div>
                    <h2>OCR Result</h2>

                <div>
                    {/* Check if text is an array and join it, otherwise display the text directly 
                    <pre>{Array.isArray(ocrResult.text) ? ocrResult.text.join("\n") : ocrResult.text}</pre>
                    */}
                </div>

                    {/* Display the formatted natural text */}
                    <div dangerouslySetInnerHTML={{ __html: formatNaturalText(ocrResult.natural_text) }} />

                    {/* Accordion for additional OCR result details */}
                    <div>
                        <button
                            style={{
                                marginTop: "10px",
                                padding: "10px",
                                backgroundColor: "#007BFF",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                            }}
                            onClick={() => setAccordionOpen(!isAccordionOpen)}
                        >
                            {isAccordionOpen ? "Collapse Details" : "Expand Details"}
                        </button>

                        {isAccordionOpen && (
                            <div style={{ marginTop: "15px", padding: "15px", border: "1px solid #ccc", borderRadius: "4px" }}>
                                <h3>Additional OCR Information</h3>
                                <ul>
                                    <li><strong>Primary Language:</strong> {ocrResult.primary_language}</li>
                                    <li><strong>Is Rotation Valid:</strong> {ocrResult.is_rotation_valid ? "Yes" : "No"}</li>
                                    <li><strong>Rotation Correction:</strong> {ocrResult.rotation_correction}</li>
                                    <li><strong>Is Table:</strong> {ocrResult.is_table ? "Yes" : "No"}</li>
                                    <li><strong>Is Diagram:</strong> {ocrResult.is_diagram ? "Yes" : "No"}</li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
