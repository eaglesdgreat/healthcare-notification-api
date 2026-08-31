default: start

project:=healthcare
service:=ms-notification
NODE_ENV:=dev
COMMIT_HASH = $(shell git rev-parse --verify HEAD)

.PHONY: start
start:
	docker-compose -p ${project} up -d

.PHONY: stop
stop:
	docker-compose -p ${project} down

.PHONY: restart
restart: stop start

.PHONY: logs
logs:
	docker-compose -p ${project} logs -f ${service}-api

.PHONY: logs-db
logs-db:
	docker-compose -p ${project} logs -f ${service}-db

.PHONY: logs-redis
logs-redis:
	docker-compose -p ${project} logs -f ${service}-redis

.PHONY: ps
ps:
	docker-compose -p ${project} ps

.PHONY: build
build:
	docker-compose -p ${project} build --no-cache

.PHONY: clean
clean: stop build start

.PHONY: install-all-packages-in-container
install-all-packages-in-container:
	docker-compose -p ${project} exec ${service}-api pnpm install

.PHONY: add
add: install-package-in-container build

.PHONY: install-package-in-container
install-package-in-container:
	docker-compose -p ${project} exec ${service}-api pnpm add ${package}

.PHONY: add-dev
add-dev: install-dev-package-in-container build

.PHONY: install-dev-package-in-container
install-dev-package-in-container: start
	docker-compose -p ${project} exec ${service}-api pnpm add -D ${package}

.PHONY: generate
generate: start
	docker-compose -p ${project} exec ${service}-api pnpm exec prisma generate

.PHONY: migration-create
migration-create: start
	docker-compose -p ${project} exec ${service}-api pnpm exec prisma migrate dev --name ${name}

.PHONY: migrate-local
migrate-local:
	pnpm exec prisma migrate deploy

.PHONY: migrate-down
migrate-down:
	docker-compose -p ${project} exec ${service}-api pnpm exec prisma migrate reset --force

.PHONY: migrate
migrate: start
	docker-compose -p ${project} exec ${service}-api pnpm exec prisma migrate deploy

.PHONY: shell
shell:
	docker-compose -p ${project} exec ${service}-api sh

.PHONY: psql
psql:
	docker-compose -p ${project} exec ${service}-db psql -U postgres -d healthcare_notification_db

.PHONY: test
test: start test-exec test-e2e test-integration

.PHONY: test-exec
test-exec:
	docker-compose -p ${project} exec ${service}-api pnpm test -- --exit

.PHONY: test-e2e
test-e2e:
	docker-compose -p ${project} exec ${service}-api pnpm test:e2e -- --exit

.PHONY: test-integration
test-integration:
	docker-compose -p ${project} exec ${service}-api pnpm test:integration

.PHONY: test-cov
test-cov:
	docker-compose -p ${project} exec ${service}-api pnpm test:cov

.PHONY: test-watch
test-watch:
	docker-compose -p ${project} exec ${service}-api pnpm test:watch

.PHONY: test-debug
test-debug:
	docker-compose -p ${project} exec ${service}-api pnpm test:debug

.PHONY: lint-fix
lint-fix: start
	docker-compose -p ${project} exec ${service}-api pnpm lint:fix

.PHONY: commit-hash
commit-hash:
	@echo $(COMMIT_HASH)

.PHONY: build-release
build-release:
	docker build --target release -t local/${service}:${COMMIT_HASH} .

.PHONY: run-release
run-release:
	docker run -d --name ${service}_${COMMIT_HASH} -p 5502:5502 local/${service}:${COMMIT_HASH}
	docker logs -f ${service}_${COMMIT_HASH}
