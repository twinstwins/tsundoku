FROM --platform=$BUILDPLATFORM node:24.22.1-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-fund
COPY frontend ./
COPY types /build/types
RUN npm run typecheck && npm run build

FROM node:10.24.1-stretch-slim AS node
FROM ruby:2.5.1

# The Ruby image already includes the build tools, MySQL headers,
# ImageMagick and MIME database needed by the locked gems.
COPY --from=node /usr/local/bin/node /usr/local/bin/node

ENV BUNDLER_VERSION=2.1.4
WORKDIR /workdir

COPY Gemfile Gemfile.lock ./
RUN gem install bundler --version "${BUNDLER_VERSION}" --no-document \
    && bundle install --jobs 4 --retry 3

COPY . .
COPY --from=frontend /build/public/frontend ./public/frontend

CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
