from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoProcessor, Qwen2VLForConditionalGeneration
from io import BytesIO
from PIL import Image
import torch
import base64
from olmocr.data.renderpdf import render_pdf_to_base64png
from olmocr.prompts import build_finetuning_prompt
from olmocr.prompts.anchor import get_anchor_text

# Initialize the FastAPI app
app = FastAPI()

# Allow CORS for your frontend (localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Allow the frontend origin
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Initialize the model
model = Qwen2VLForConditionalGeneration.from_pretrained(
    "allenai/olmOCR-7B-0225-preview", torch_dtype=torch.bfloat16
).eval()
processor = AutoProcessor.from_pretrained("Qwen/Qwen2-VL-7B-Instruct")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

@app.post("/ocr")
async def ocr(pdf: UploadFile = File(...)):
    try:
        # Save the uploaded PDF file temporarily
        pdf_content = await pdf.read()
        pdf_path = "./temp_uploaded_pdf.pdf"
        with open(pdf_path, "wb") as f:
            f.write(pdf_content)

        # Render page 1 of the PDF to an image (base64 encoded)
        image_base64 = render_pdf_to_base64png(pdf_path, 1, target_longest_image_dim=1024)

        # Extract anchor text (metadata) from the first page of the PDF
        anchor_text = get_anchor_text(pdf_path, 1, pdf_engine="pdfreport", target_length=4000)
        prompt = build_finetuning_prompt(anchor_text)

        # Build the full prompt
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}},
                ],
            }
        ]

        # Apply the chat template and processor
        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        main_image = Image.open(BytesIO(base64.b64decode(image_base64)))

        # Prepare inputs for the model
        inputs = processor(
            text=[text],
            images=[main_image],
            padding=True,
            return_tensors="pt",
        )
        inputs = {key: value.to(device) for (key, value) in inputs.items()}

        # Generate the output
        output = model.generate(
            **inputs,
            temperature=0.8,
            # max_new_tokens=50,
            num_return_sequences=1,
            do_sample=True,
        )

        # Decode the output
        prompt_length = inputs["input_ids"].shape[1]
        new_tokens = output[:, prompt_length:]
        text_output = processor.tokenizer.batch_decode(new_tokens, skip_special_tokens=True)

        return JSONResponse(content={"text": text_output})

    except Exception as e:
        # Return a friendly error message
        raise HTTPException(status_code=500, detail=f"Error processing OCR: {str(e)}")
