import requests
import json
payload = {
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "dict_of_vars": {}
}
response = requests.post('http://localhost:8900/calculate', json=payload)
print(response.status_code)
print(response.text)
