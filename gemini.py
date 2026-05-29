from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3001/v1",
    api_key="freellmapi-e52fe62683154d080a5ce83401ede49bd3d731ee0ac95e79"
)

stream = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Write a short haiku about SQLite."}],
    stream=True, # <-- Enable streaming
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
print()
