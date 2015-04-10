test:
	@node node_modules/lab/bin/lab -v -L -a code
test-cov:
	@node node_modules/lab/bin/lab -v -t 100 -m 3000 -L -a code
test-cov-html:
	@node node_modules/lab/bin/lab -r html -o coverage.html -m 3000 -L -a code

.PHONY: test test-cov test-cov-html