AUTO_REPO_ROOT = ../integrated-automations

build-auto:
	mkdir -p build
	nvm use || true
	node bin/wetzel.js ${AUTO_REPO_ROOT}/mod-plugins/plugins-core/src/main/resources-fixtures/_wk/schemas/plugins/-ToE.schema.json \
         -a=cqo \
         -l 1 \
         -i '["https://json-schema.org/draft-06/schema", "https://json-schema.org/draft-07/schema", "https://json-schema.org/draft/2019-09/schema"]' \
         > build/SCHEMA.md
