import json

with open(r'C:\Users\roryulloa\.gemini\antigravity-ide\brain\e983e5be-f820-46f6-b654-4046be8ffd73\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(424, min(len(lines), 500)):
    data = json.loads(lines[i])
    if data.get('source') == 'USER_EXPLICIT' or (data.get('type') == 'PLANNER_RESPONSE' and not data.get('tool_calls')):
        content = data.get('content', '')
        if content:
            print(f"=== {i} [{data.get('type')}] ===")
            print(content[:500])
