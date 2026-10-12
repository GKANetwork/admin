package com.gha.eventservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
public class GhaEventServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(GhaEventServiceApplication.class, args);
    }
}
