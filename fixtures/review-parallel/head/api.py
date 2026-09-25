from pricing import total

def document(request, repository):
    if not request.session.tenant_id:
        raise PermissionError('sign in')
    return repository.get(request.session.tenant_id, request.document_id)

def invoice(items):
    return {'total': total(items)}
