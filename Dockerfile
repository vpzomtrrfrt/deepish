FROM alpine:3.23 AS builder
RUN apk add --no-cache nodejs npm

RUN adduser -S builder
USER builder

WORKDIR /var/src/deepish
COPY --chown=builder package.json ./
COPY --chown=builder package-lock.json ./

RUN npm install

COPY --chown=builder . ./

RUN NODE_ENV=production npm run build

FROM nginx:1.28-alpine

COPY --from=builder /var/src/deepish/dist/ /usr/share/nginx/html/

COPY <<-EOF /etc/nginx/nginx.conf
	events {}

	http {
		include /etc/nginx/mime.types;

		server {
			listen 80;

			location / {
				root /usr/share/nginx/html;

				add_header Cache-Control "no-cache";

				try_files \$uri /index.html =404;

				location /assets {
					add_header Cache-control "public, max-age=604800, immutable";
				}
			}
		}
	}
EOF
