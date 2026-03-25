import ast
with open('api/routes.py', encoding='utf-8') as f:
    code = f.read()
try:
    ast.parse(code)
    print("✓ routes.py syntax OK")
except SyntaxError as e:
    print(f"✗ Syntax error: {e}")
    import traceback
    traceback.print_exc()
