import json

with open(r'C:\Users\roryulloa\.gemini\antigravity-ide\brain\e983e5be-f820-46f6-b654-4046be8ffd73\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        if data.get('type') == 'USER_INPUT':
            print(f'Line {i}: {data.get("content")}')
