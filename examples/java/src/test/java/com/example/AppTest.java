package com.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;

class AppTest {
    @Test
    void greetReturnsHello() {
        assertEquals("Hello, Harness!", App.greet("Harness"));
    }
}
