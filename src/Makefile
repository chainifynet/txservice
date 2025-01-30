SHELL=/usr/bin/env bash

run:
	npm run start
build:
	npm run build

build-app: pre-build build-linux build-resources

pre-build:
	@echo "Preparing build deps"
	@mkdir -p ../build

build-linux: build-check
	@echo "Compile go application binary"
	npm run build

build-resources: build-check
	@echo "Copying app required resources into build directory"
	@cp -R . ../build/

build-check:
	@echo "Checking requirements..."
	@if [ ! -d ../build ]; then echo "ERROR: 'build' folder doesnt exist"; exit 1; fi;

clean:
	@echo "Remove previous build dir"
	@rm -rf ../build
	@rm -rf dist
