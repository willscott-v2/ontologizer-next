jQuery(document).ready(function($) {
    $('#ontologizer-clear-cache').on('click', function(e) {
        e.preventDefault();

        const button = $(this);
        const spinner = button.siblings('.spinner');
        const feedback = $('#ontologizer-cache-feedback');

        button.prop('disabled', true);
        spinner.addClass('is-active');
        feedback.hide().removeClass('notice-success notice-error');

        $.ajax({
            url: ontologizer_admin_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'ontologizer_clear_cache',
                nonce: ontologizer_admin_ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    feedback.text(response.data).addClass('notice-success').show();
                } else {
                    feedback.text(response.data || 'An unknown error occurred.').addClass('notice-error').show();
                }
            },
            error: function() {
                feedback.text('A network error occurred. Please try again.').addClass('notice-error').show();
            },
            complete: function() {
                button.prop('disabled', false);
                spinner.removeClass('is-active');
                
                // Hide the feedback message after 5 seconds
                setTimeout(function() {
                    feedback.fadeOut();
                }, 5000);
            }
        });
    });
}); 