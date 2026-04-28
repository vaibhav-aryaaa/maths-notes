import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv("/Users/vaibhavarya/Documents/Culture/math-note/maths-note-be/.env")
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(m.name)
