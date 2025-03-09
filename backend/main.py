from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoProcessor, Qwen2VLForConditionalGeneration
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv
import torch
import base64
import os
import json

# Custom modules
from olmocr.data.renderpdf import render_pdf_to_base64png
from olmocr.prompts import build_finetuning_prompt
from olmocr.prompts.anchor import get_anchor_text


load_dotenv()
# Initialize FastAPI app
app = FastAPI(title="OCR Service")
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")

# Allow CORS for your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origins],  # Adjust this if your frontend changes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize model & processor
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = Qwen2VLForConditionalGeneration.from_pretrained(
    "allenai/olmOCR-7B-0225-preview", torch_dtype=torch.bfloat16
).eval().to(device)

processor = AutoProcessor.from_pretrained("Qwen/Qwen2-VL-7B-Instruct")

@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    """
    Perform OCR on the uploaded PDF or image file and return the extracted text.
    """
    temp_file_path = "./temp_uploaded_file"

    try:
        # Step 1: Read uploaded file
        if not file:
            raise HTTPException(status_code=400, detail="No file uploaded.")

        # Save the uploaded file to a temporary path
        file_content = await file.read()
        with open(temp_file_path, "wb") as f:
            f.write(file_content)

        # Step 2: Determine the file type (PDF or Image)
        file_type = file.filename.split('.')[-1].lower()

        if file_type == "pdf":
            # Handle PDF: Render the first page to base64 PNG image
            image_base64 = render_pdf_to_base64png(temp_file_path, 1, target_longest_image_dim=1024)
            # Extract anchor text (metadata) for PDF
            anchor_text = get_anchor_text(temp_file_path, 1, pdf_engine="pdfreport", target_length=4000)
        elif file_type in ["png", "jpeg", "jpg"]:
            # Handle Image: Process the image directly
            image_base64 = base64.b64encode(file_content).decode('utf-8')
            # No anchor text extraction for images
            anchor_text = "Image uploaded for OCR processing."
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Only PDF and image files are supported.")

        # Build prompt
        prompt = build_finetuning_prompt(anchor_text)

        # Step 3: Build message input for processor
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}},
                ],
            }
        ]

        # Step 4: Apply the template to prepare the input for the model
        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

        # Step 5: Prepare image for input if it's an image (or use the PDF rendered image)
        if file_type == "pdf":
            main_image = Image.open(BytesIO(base64.b64decode(image_base64)))
        else:
            main_image = Image.open(BytesIO(file_content))

        # Step 6: Prepare model inputs
        inputs = processor(
            text=[text],
            images=[main_image],
            padding=True,
            return_tensors="pt",
        )

        # Move inputs to device (GPU/CPU)
        inputs = {key: value.to(device) for key, value in inputs.items()}

        # Step 7: Generate output from model
        output = model.generate(
            **inputs,
            temperature=0.8,
            do_sample=True,
            num_return_sequences=1,
            max_new_tokens=2048,
        )

        # Step 8: Decode generated tokens into text
        prompt_length = inputs["input_ids"].shape[1]
        new_tokens = output[:, prompt_length:]

        # Decode generated tokens into text
        decoded_text = processor.tokenizer.batch_decode(new_tokens, skip_special_tokens=True)
        full_text = " ".join(decoded_text).strip()

        # Convert the full_text JSON string to a Python dict
        try:
            parsed_data = json.loads(full_text)
        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON: {e}")
            raise HTTPException(status_code=500, detail="OCR result is not a valid JSON.")

        # Return parsed JSON to the frontend
        print(f"Decoded JSON Data: {parsed_data}")
        return parsed_data

    except HTTPException as http_err:
        # Directly re-raise FastAPI-specific exceptions
        raise http_err

    except Exception as e:
        print(f"Error processing OCR: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    finally:
        # Cleanup temp files
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
