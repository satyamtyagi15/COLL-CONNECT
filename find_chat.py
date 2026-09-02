import json
import os

transcript_path = r"c:\Users\Shivam\.gemini\antigravity-ide\brain\cb14a3ed-a3c1-4008-af9c-4b7188f5fa2c\.system_generated\logs\transcript.jsonl"
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
        except:
            continue
        if "tool_calls" in data:
            for call in data["tool_calls"]:
                name = call.get("name", "")
                if name in ("replace_file_content", "multi_replace_file_content", "write_to_file"):
                    args = call.get("args", {})
                    target_file = args.get("TargetFile", "")
                    if "AdminPage.jsx" in target_file:
                        content = args.get("TargetContent", "") or args.get("CodeContent", "")
                        if "chats" in content.lower():
                            print(f"Step {data.get('step_index')}: Found chats in AdminPage!")
                            print(content[:200])
