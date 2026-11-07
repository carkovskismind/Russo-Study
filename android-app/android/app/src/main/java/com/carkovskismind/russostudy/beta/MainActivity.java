package com.carkovskismind.russostudy.beta;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int DARK = Color.parseColor("#0B0B0C");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fondo oscuro detrás de las barras del sistema (también cuando la página es clara).
        getWindow().getDecorView().setBackgroundColor(DARK);
        getWindow().setNavigationBarColor(DARK);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(false);

        // Android 15+ dibuja la app bajo las barras: se deja el margen para que nada quede tapado.
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        // Atrás del sistema = atrás en la app. La app usa la History API: cada pantalla interna
        // deja una entrada de historial, así que el WebView retrocede dentro de la app y solo
        // se sale cuando ya se está en el inicio (sin entradas atrás).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null && web.canGoBack()) {
                    web.goBack();
                } else {
                    finish();
                }
            }
        });
    }
}
