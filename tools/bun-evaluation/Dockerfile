FROM oven/bun:1.4.4 AS bun
FROM mcr.microsoft.com/playwright:v1.64.1-noble
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
