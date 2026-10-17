# PLAYBOOK_PUBLIC_KEY (base64 SPKI DER) is embedded for check-script verification;
# built without it, the check phase is always reported as skipped.
detonator-linux-amd64:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w -X main.checkScriptPublicKey=$(PLAYBOOK_PUBLIC_KEY)" -o $@ .
	sha256sum $@ || shasum -a 256 $@
