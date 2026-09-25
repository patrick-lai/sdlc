def get_document(request, store):
    tenant = request.session.tenant_id
    if not tenant:
        raise PermissionError('no tenant')
    return store.get(tenant, request.document_id)
