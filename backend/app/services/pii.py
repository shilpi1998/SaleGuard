import re

CREDIT_CARD_PATTERN = re.compile(r"\b(\d{4})[\s\-]?(\d{4})[\s\-]?(\d{4})[\s\-]?(\d{4})\b")
PHONE_PATTERN = re.compile(r"\b(0[2-8]\d{8}|04\d{8}|\+61\d{9})\b")
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")


def redact_pii(text: str) -> str:
    text = CREDIT_CARD_PATTERN.sub(r"\1 **** **** ****", text)
    return text


def redact_pii_full(text: str) -> str:
    text = CREDIT_CARD_PATTERN.sub(r"\1 **** **** ****", text)
    text = PHONE_PATTERN.sub("[PHONE REDACTED]", text)
    text = EMAIL_PATTERN.sub("[EMAIL REDACTED]", text)
    return text
