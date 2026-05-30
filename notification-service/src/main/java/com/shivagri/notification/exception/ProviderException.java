package com.shivagri.notification.exception;

public class ProviderException extends NotificationException {

    private final int statusCode;
    private final String providerBody;

    public ProviderException(String message, int statusCode, String providerBody) {
        super(message);
        this.statusCode = statusCode;
        this.providerBody = providerBody;
    }

    public ProviderException(String message, Throwable cause) {
        super(message, cause);
        this.statusCode = 0;
        this.providerBody = null;
    }

    public int getStatusCode() {
        return statusCode;
    }

    public String getProviderBody() {
        return providerBody;
    }
}
