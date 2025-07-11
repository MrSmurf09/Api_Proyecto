build:
	docker-compose up -d --build

down:
	docker-compose down
	rm -fr ./dbdata

execmariadb:
	docker exec -it mariadbproductos mariadb -u root -p