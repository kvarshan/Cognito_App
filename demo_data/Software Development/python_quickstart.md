# Python Quickstart Guide for Machine Learning

Python is the absolute standard for data science and AI development. Below is a quick cheatsheet of essential concepts used in building local indexes and ML models.

## 1. List and Dict Comprehensions
Comprehensions are concise ways to generate lists and dictionaries.
```python
# List comprehension
squared_numbers = [x**2 for x in range(10)]

# Dictionary comprehension
document_lengths = {doc_name: len(text) for doc_name, text in docs.items()}
```

## 2. Text Preprocessing and Tokenization
Before training vectorizers, text must be normalized.
```python
def preprocess(text):
    # Lowercase and split into words
    words = text.lower().split()
    # Filter non-alphabetic tokens
    return [w for w in words if w.isalpha()]
```

## 3. Object-Oriented Database Connectors
Wrapping SQLite connections in clear classes.
```python
import sqlite3

class LocalDB:
    def __init__(self, path):
        self.conn = sqlite3.connect(path)
        
    def query(self, sql, params=()):
        with self.conn:
            return self.conn.execute(sql, params).fetchall()
```
