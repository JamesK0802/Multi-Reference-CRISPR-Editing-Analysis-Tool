import requests

url = "http://localhost:8000/analyze"
files = {'files': ('test.txt', b'hello')}
data = {
    'data_type': 'single-end',
    'interest_region': 90,
    'phred_threshold': 10,
    'indel_threshold': 1.0,
    'targets': '[]',
    'is_multi_reference': 'true',
    'assignment_margin_threshold': 0.05,
    'analyze_ambiguous': 'true',
    'rescue_ambiguous': 'true'
}
response = requests.post(url, files=files, data=data)
print(response.json())
