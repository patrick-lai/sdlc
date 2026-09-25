def price_label(response):
    return f"${response['total'] / 100:.2f}"

def checkout_label(use_modern):
    if use_modern:
        return 'Pay now'
    return 'Submit order'
