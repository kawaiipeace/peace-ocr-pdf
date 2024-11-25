'use client'

import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'; // PDF parsing
import Tesseract from 'tesseract.js'; // OCR library
import PizZip from 'pizzip'; // Pizzip for creating DOCX
import Docxtemplater from 'docxtemplater'; // Docxtemplater for generating DOCX
import {Pagination, PaginationItem, PaginationCursor} from "@nextui-org/pagination";

export default function Home() {
  const [ocrResults, setOcrResults] = useState<string[]>([]); // Store OCR results for each page
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]); // Store rendered pages as images
  const [currentPage, setCurrentPage] = useState<number>(1); // Track current page (for pagination)
  const [loading, setLoading] = useState<boolean>(false); // Loading state
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null); // Track file type
  const [overallProgress, setOverallProgress] = useState<number>(0); // Overall progress for the entire document
  const [currentPageProgress, setCurrentPageProgress] = useState<number>(0); // Progress for the current page

  // Set the worker source URL for pdf.js
  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }

  // Convert PDF page to image
  const renderPageToImage = async (page: pdfjsLib.PDFPageProxy, scale: number = 3): Promise<HTMLCanvasElement> => {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!canvas || !context) {
      throw new Error('Canvas or context is null.');
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = viewport.width * pixelRatio;
    canvas.height = viewport.height * pixelRatio;
    context.scale(pixelRatio, pixelRatio);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      enableWebGL: false,
    };

    const renderTask = page.render(renderContext);
    await renderTask.promise;

    return canvas;
  };

  // Load PDF and extract pages as images
  const loadPdf = async (file: File): Promise<void> => {
    let uri: string = URL.createObjectURL(file);
    const pdf = await pdfjsLib.getDocument({ url: uri }).promise;

    const totalPages = pdf.numPages;
    const pages: HTMLCanvasElement[] = [];
    const ocrResults: string[] = [];

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const canvas = await renderPageToImage(page);
      pages.push(canvas);

      // Perform OCR on each page using Tesseract.js
      const result = await Tesseract.recognize(
        canvas,
        'tha+eng', // Thai and English language support
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setCurrentPageProgress(m.progress * 100); // Update progress for the current page
            }
          },
        }
      );

      // After each page OCR is done, calculate overall progress
      const pageProgress = ((i) / totalPages) * 100;
      setOverallProgress(pageProgress); // Update overall progress after each page is OCR'd

      ocrResults.push(result.data.text);

      // Move to the next page after finishing OCR for this one
      if (i < totalPages) {
        setCurrentPage(i + 1);
        setCurrentPageProgress(0); // Reset progress for the next page
      }
    }

    setPages(pages);
    setOcrResults(ocrResults);
  };

  // Perform OCR on an image file
  const ocrImage = async (file: File): Promise<void> => {
    const ocrResult = await Tesseract.recognize(
      file,
      'tha+eng', // Thai and English language support
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOverallProgress(m.progress * 100); // Update overall progress
            setCurrentPageProgress(m.progress * 100); // Update current page progress
          }
        },
      }
    );

    setOcrResults([ocrResult.data.text]);
    setPages([]); // No pages to display for images
  };

  // Handle file input change
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const file = event.target.files[0];

    // Ensure the file is valid
    if (!file) {
      console.error('No file selected.');
      return;
    }

    setLoading(true);
    setOverallProgress(0); // Reset overall progress bar
    setCurrentPageProgress(0); // Reset current page progress
    setOcrResults([]); // Reset OCR results
    setPages([]); // Reset the images
    setCurrentPage(1); // Reset current page

    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    // Check the file type
    if (fileExtension === 'pdf') {
      setFileType('pdf');
      await loadPdf(file);
    } else if (fileExtension === 'jpg' || fileExtension === 'jpeg' || fileExtension === 'png') {
      setFileType('image');
      await ocrImage(file);
    } else {
      console.error('Unsupported file type');
      setLoading(false);
      return;
    }

    setLoading(false);
  };

  // Change page number
  const changePage = (pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > pages.length) return;
    setCurrentPage(pageNumber);
  };

  // Export OCR results to Word (docx)
  const exportToWord = () => {
    const docContent = ocrResults.map((text, index) => {
      return `
        <w:p><w:r><w:t>Page ${index + 1}</w:t></w:r></w:p>
        <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
      `;
    }).join('');

    // Create a DOCX template structure (XML-based)
    const docTemplate = `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          ${docContent}
        </w:body>
      </w:document>
    `;

    // Initialize PizZip and create a DOCX structure
    const zip = new PizZip();

    // Add the core parts of a DOCX file, e.g., [word/document.xml], [word/_rels/.rels], [word/styles.xml]
    zip.file("word/document.xml", docTemplate);
    zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');

    // Add the relationships file (_rels/.rels)
    zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" TargetMode="Internal"/></Relationships>');

    // Add word/styles.xml (empty styles for this example)
    zip.file("word/styles.xml", '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>');

    // Create the DOCX file by generating a Blob from the zip object
    const docBlob = zip.generate({ type: 'blob' });

    // Create a download link for the DOCX file
    const link = document.createElement('a');
    link.href = URL.createObjectURL(docBlob);
    link.download = 'ocr_results.docx';
    link.click();
  };

  return (
    <div>
      <h1>OCR PDF or Image with Thai Language Support</h1>
      <input type="file" accept=".pdf,image/*" onChange={handleFileChange} />

      {loading && (
        <div style={{ marginTop: '20px' }}>
          <p>Loading and performing OCR...</p>
          <div style={{ width: '100%', backgroundColor: '#e0e0e0', borderRadius: '10px' }}>
            <div
              style={{
                height: '20px',
                width: `${overallProgress}%`,
                backgroundColor: '#4caf50',
                borderRadius: '10px',
                transition: 'width 0.5s ease-out',
              }}
            />
          </div>
          <p style={{ textAlign: 'center' }}>{Math.round(overallProgress)}%</p>
        </div>
      )}

      {!loading && ocrResults.length > 0 && (
        <div>
          {fileType === 'pdf' && (
            <div>
              {/* Pagination Controls for PDF */}
              <Pagination 
                loop
                showControls 
                color="secondary" 
                total={pages.length} 
                initialPage={1}
                page={currentPage}
                onChange={setCurrentPage}
              />

              {/* Display OCR Result and Image for the current page */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ marginBottom: '20px' }}>
                  <h2>Page {currentPage} OCR Result:</h2>
                  <pre>{ocrResults[currentPage - 1]}</pre>
                </div>

                <div>
                  <h3>Page {currentPage} Preview:</h3>
                  <img src={pages[currentPage - 1].toDataURL()} alt={`Page ${currentPage}`} />
                </div>
              </div>
            </div>
          )}

          {fileType === 'image' && (
            <div>
              <h2>OCR Result for Image:</h2>
              <pre>{ocrResults[0]}</pre>
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <button onClick={exportToWord} style={{ padding: '10px', cursor: 'pointer' }}>
              Export to Word
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
